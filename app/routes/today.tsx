import {
  CalendarIcon,
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CircleHelpIcon,
  MoonIcon,
  PlusIcon,
  XIcon,
} from 'lucide-react';
import { Expose, Transform } from 'class-transformer';
import { IsInt, IsNumber, IsOptional, IsPositive, IsUUID } from 'class-validator';
import { useState } from 'react';
import { data, Link, useFetcher, useNavigate } from 'react-router';

import { requireAthlete } from '~/auth/user-context';
import { Page, PageHeader, Section } from '~/components/layout/page';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { Calendar } from '~/components/ui/calendar';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';
import { EmptyState } from '~/components/ui/empty-state';
import { Field } from '~/components/ui/field';
import { Input } from '~/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '~/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/components/ui/select';
import { SubmitButton } from '~/components/ui/submit-button';
import type { CardioKind } from '~/domain/equipment/equipment';
import type { ExerciseType } from '~/domain/exercise/exercise-type';
import { DateOnly } from '~/domain/values/date-only';
import type { DistanceUnit, WeightUnit } from '~/domain/values/units';
import { speedUnitLabel } from '~/domain/values/units';
import { cardioFieldsFor } from '~/lib/cardio-equipment';
import { formatFullDate, formatMonthDay, formatRelativeDate, formatWeekday } from '~/lib/format';
import { requestLogger } from '~/lib/logger.server';
import { cn } from '~/lib/utils';
import { intent } from '~/lib/intent';
import { dispatch, handled } from '~/lib/intent.server';
import { IsDateOnly, toOptionalNumber } from '~/lib/validate-form';
import type { WeekHistoryDay, WeekPlanDay } from '~/services/training-plan-service.server';
import type { LoggedSetView, RecentSetView } from '~/services/workout-log-service.server';

import { exerciseLibraryServiceContext, trainingPlanServiceContext, workoutLogServiceContext } from '~/lib/nest-bridge.server';

import type { Route } from './+types/today';

export function meta() {
  return [{ title: 'Today - Apex Gains' }];
}

/**
 * The minimum an exercise has to offer for the log form to render the right
 * fields for it. Both the plan's items and the full library satisfy it.
 */
type LoggableExercise = {
  id: string;
  name: string;
  exerciseType: ExerciseType;
  equipmentCardioKinds: (CardioKind | null)[];
};

export async function loader({ request, context }: Route.LoaderArgs) {
  const athlete = requireAthlete(context);
  const today = DateOnly.today();

  // An unparseable or future ?date falls back to today rather than erroring -
  // there is nothing to log against a day that hasn't happened.
  const requested = DateOnly.tryParse(new URL(request.url).searchParams.get('date'));
  const date = requested?.isOnOrBefore(today) ? requested : today;

  const planService = context.get(trainingPlanServiceContext);
  const logService = context.get(workoutLogServiceContext);
  const libraryService = context.get(exerciseLibraryServiceContext);

  const [plan, loggedSets, allExercises, upcomingWeek, pastWeek] = await Promise.all([
    planService.planFor(athlete, date),
    logService.loggedSetsFor(athlete, date),
    libraryService.listExercises(athlete),
    planService.upcomingWeek(athlete, today),
    planService.pastWeek(athlete, today),
  ]);

  return {
    date: date.value,
    todayStr: today.value,
    isToday: date.equals(today),
    plan,
    loggedSets,
    allExercises,
    upcomingWeek,
    pastWeek,
    weightUnit: athlete.preferences.weightUnit,
    distanceUnit: athlete.preferences.distanceUnit,
  };
}

class LogSetDto {
  @Expose()
  @IsUUID()
  readonly exerciseId!: string;

  @Expose()
  @IsDateOnly()
  readonly date!: string;

  @Expose()
  @Transform(toOptionalNumber())
  @IsOptional()
  @IsInt()
  @IsPositive()
  readonly reps?: number;

  @Expose()
  @Transform(toOptionalNumber())
  @IsOptional()
  @IsNumber()
  @IsPositive()
  readonly weight?: number;

  @Expose()
  @Transform(toOptionalNumber())
  @IsOptional()
  @IsNumber()
  @IsPositive()
  readonly durationMinutes?: number;

  @Expose()
  @Transform(toOptionalNumber())
  @IsOptional()
  @IsNumber()
  @IsPositive()
  readonly speed?: number;

  @Expose()
  @Transform(toOptionalNumber())
  @IsOptional()
  @IsInt()
  @IsPositive()
  readonly resistance?: number;
}

class RemoveSetDto {
  @Expose()
  @IsDateOnly({ message: 'Unknown set' })
  readonly date!: string;

  @Expose()
  @IsUUID(undefined, { message: 'Unknown set' })
  readonly setId!: string;
}

const intents = {
  logSet: intent('logSet', LogSetDto, { invalidMessage: 'Invalid set' }),
  removeSet: intent('removeSet', RemoveSetDto),
};

export async function action({ request, context }: Route.ActionArgs) {
  const athlete = requireAthlete(context);
  const today = DateOnly.today();
  const logService = context.get(workoutLogServiceContext);

  return dispatch(request, [
    handled(intents.logSet, async (input) => {
      // Clamp instead of rejecting: a stale form (left open since yesterday)
      // should still log against today rather than fail outright.
      const date = DateOnly.parse(input.date).atMost(today);

      // Measurements are in the athlete's own units; the service converts them.
      const outcome = await logService.logSet(athlete, date, input.exerciseId, {
        reps: input.reps,
        weight: input.weight,
        durationMinutes: input.durationMinutes,
        speed: input.speed,
        resistance: input.resistance,
      });

      if (!outcome.ok) {
        return intents.logSet.reject('Invalid set');
      }
      if (outcome.value.sessionOpened) {
        requestLogger(context).log(`opened session on ${date.value} for user ${athlete.id}`, 'Today');
      }
      return { ok: true };
    }),

    handled(intents.removeSet, async ({ date, setId }) => {
      await logService.removeSet(athlete, DateOnly.parse(date), setId);
      return { ok: true };
    }),
  ]);
}

/** Groups a newest-first flat set list into one entry per day it was logged. */
function groupSetsByDate(sets: RecentSetView[]): { date: string; summaries: string[] }[] {
  const groups: { date: string; summaries: string[] }[] = [];
  for (const set of sets) {
    const current = groups.at(-1);
    if (current && current.date === set.date) {
      current.summaries.push(set.summary);
    } else {
      groups.push({ date: set.date, summaries: [set.summary] });
    }
  }
  return groups;
}

/**
 * A "?" that opens an overlay of the last few times this exercise was
 * logged, so the reps/weight fields below don't have to be filled in blind.
 * Fetched lazily on first open rather than up front for every exercise on
 * the page.
 */
function ExerciseHistoryButton({
  exerciseId,
  exerciseName,
  todayStr,
}: {
  exerciseId: string;
  exerciseName: string;
  todayStr: string;
}) {
  const fetcher = useFetcher<{ sets: RecentSetView[] }>();
  const [open, setOpen] = useState(false);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next && fetcher.state === 'idle' && !fetcher.data) {
      fetcher.load(`/exercises/${exerciseId}/history`);
    }
  }

  const groups = fetcher.data ? groupSetsByDate(fetcher.data.sets) : [];

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="text-muted-foreground"
          aria-label={`Show recent history for ${exerciseName}`}
        >
          <CircleHelpIcon aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72">
        <p className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{exerciseName}: recent sets</p>
        {fetcher.state !== 'idle' ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : groups.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {groups.map((group) => (
              <li key={group.date} className="text-sm">
                <span className="font-medium">{formatRelativeDate(group.date, todayStr)}</span>
                <span className="text-muted-foreground tabular-nums"> · {group.summaries.join(', ')}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">Nothing logged for this exercise yet.</p>
        )}
      </PopoverContent>
    </Popover>
  );
}

function LogSetForm({
  exercise,
  exerciseOptions,
  date,
  todayStr,
  weightUnit,
  distanceUnit,
}: {
  exercise?: LoggableExercise;
  exerciseOptions?: LoggableExercise[];
  date: string;
  todayStr: string;
  weightUnit: WeightUnit;
  distanceUnit: DistanceUnit;
}) {
  const fetcher = useFetcher();
  const [selectedId, setSelectedId] = useState(exercise?.id ?? '');
  const active = exercise ?? exerciseOptions?.find((e) => e.id === selectedId);
  const pending = fetcher.state !== 'idle';
  const error = fetcher.data && 'error' in fetcher.data ? fetcher.data.error : null;
  const { showSpeed, showResistance } = cardioFieldsFor(active?.equipmentCardioKinds ?? []);

  return (
    <fetcher.Form method="post" className="flex flex-col gap-3">
      <input {...intents.logSet.field} />
      <input type="hidden" name="date" value={date} />
      {exercise ? (
        <input type="hidden" name="exerciseId" value={exercise.id} />
      ) : (
        <Field
          label="Exercise"
          className="sm:max-w-xs"
          action={
            active ? <ExerciseHistoryButton exerciseId={active.id} exerciseName={active.name} todayStr={todayStr} /> : null
          }
        >
          {({ id }) => (
            <Select name="exerciseId" value={selectedId} onValueChange={setSelectedId}>
              <SelectTrigger id={id} className="w-full">
                <SelectValue placeholder="Choose an exercise" />
              </SelectTrigger>
              <SelectContent>
                {exerciseOptions?.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </Field>
      )}

      {active?.exerciseType === 'strength' ? (
        <div className="grid grid-cols-2 gap-3 sm:max-w-xs">
          <Field label="Reps">
            <Input name="reps" type="number" min={1} inputMode="numeric" placeholder="reps" />
          </Field>
          <Field label={`Weight (${weightUnit})`}>
            <Input name="weight" type="number" min={0} step="0.5" inputMode="decimal" placeholder={weightUnit} />
          </Field>
        </div>
      ) : null}

      {active?.exerciseType === 'cardio' ? (
        <div
          className={cn(
            'grid grid-cols-2 gap-3 sm:max-w-md',
            showSpeed && showResistance ? 'sm:grid-cols-3' : 'sm:grid-cols-2',
          )}
        >
          <Field label="Minutes">
            <Input name="durationMinutes" type="number" min={1} inputMode="numeric" placeholder="min" />
          </Field>
          {showSpeed ? (
            <Field label={`Speed (${speedUnitLabel(distanceUnit)})`}>
              <Input
                name="speed"
                type="number"
                min={0}
                step="0.1"
                inputMode="decimal"
                placeholder={speedUnitLabel(distanceUnit)}
              />
            </Field>
          ) : null}
          {showResistance ? (
            <Field label="Resistance">
              <Input name="resistance" type="number" min={1} inputMode="numeric" placeholder="level" />
            </Field>
          ) : null}
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="text-sm font-medium text-destructive">
          {error}
        </p>
      ) : null}

      <SubmitButton
        pending={pending}
        pendingLabel="Logging set"
        disabled={!active}
        size="sm"
        variant="brand"
        className="self-start"
      >
        {pending ? null : <PlusIcon aria-hidden="true" />}
        Log set
      </SubmitButton>
    </fetcher.Form>
  );
}

function LoggedSetsList({ sets, date }: { sets: LoggedSetView[]; date: string }) {
  if (sets.length === 0) return null;
  return (
    <ol className="flex flex-col gap-1.5">
      {sets.map((set, index) => (
        <li key={set.id} className="flex items-center gap-2.5 rounded-lg bg-muted/60 py-1.5 pr-1.5 pl-2.5 text-sm">
          <span
            aria-hidden="true"
            className="flex size-5 shrink-0 items-center justify-center rounded-md bg-brand-muted text-[0.6875rem] font-semibold text-brand-strong tabular-nums"
          >
            {index + 1}
          </span>
          <span className="min-w-0 flex-1 truncate tabular-nums">
            <span className="sr-only">Set {index + 1}: </span>
            {set.summary}
          </span>
          <form method="post" className="contents">
            <input {...intents.removeSet.field} />
            <input type="hidden" name="date" value={date} />
            <input type="hidden" name="setId" value={set.id} />
            <button
              type="submit"
              className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors duration-(--dur-fast) hover:bg-destructive/10 hover:text-destructive pointer-coarse:size-8"
            >
              <XIcon className="size-3.5" aria-hidden="true" />
              <span className="sr-only">
                Remove set {index + 1}, {set.summary}
              </span>
            </button>
          </form>
        </li>
      ))}
    </ol>
  );
}

/** One day in a week rail. Shared by the upcoming plan and the past summary. */
function DayCell({
  date,
  isToday = false,
  label,
  to,
  children,
}: {
  date: string;
  isToday?: boolean;
  /** Full sentence for screen readers, e.g. "Tuesday 2 September, Push Day". */
  label: string;
  /** When set, the whole cell links here (e.g. to log that day). */
  to?: string;
  children: React.ReactNode;
}) {
  const cellClassName = cn(
    'relative flex min-w-18 flex-1 flex-col items-center gap-1 rounded-xl border px-2 py-2.5 text-center transition-colors duration-(--dur)',
    isToday ? 'border-brand/40 bg-brand-muted' : 'border-border bg-card/50',
    to ? 'outline-none hover:border-brand/40 hover:bg-brand-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50' : null,
  );

  const content = (
    <>
      {isToday ? <span aria-hidden="true" className="absolute inset-x-3 top-0 h-0.5 rounded-full bg-brand-strong" /> : null}
      <span aria-hidden="true" className={cn('text-xs font-medium', isToday ? 'text-brand-strong' : 'text-muted-foreground')}>
        {formatWeekday(date)}
      </span>
      <span aria-hidden="true" className="text-[0.625rem] text-muted-foreground tabular-nums">
        {formatMonthDay(date)}
      </span>
      <div aria-hidden="true" className="mt-0.5 w-full">
        {children}
      </div>
    </>
  );

  if (to) {
    return (
      <li className="flex min-w-18 flex-1">
        <Link to={to} aria-label={label} className={cellClassName}>
          {content}
        </Link>
      </li>
    );
  }

  return (
    <li aria-label={label} className={cellClassName}>
      {content}
    </li>
  );
}

function WeekRail({ children }: { children: React.ReactNode }) {
  return <ul className="scrollbar-none -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">{children}</ul>;
}

function UpcomingWeekCard({ days }: { days: WeekPlanDay[] }) {
  const planned = days.filter((d) => d.type === 'template').length;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Next seven days</CardTitle>
        <p className="text-sm text-muted-foreground">
          {planned} workout{planned === 1 ? '' : 's'} scheduled
        </p>
      </CardHeader>
      <CardContent>
        <WeekRail>
          {days.map((day, index) => {
            const what = day.type === 'template' ? day.templateName : day.type === 'rest' ? 'Rest day' : 'Nothing scheduled';
            return (
              <DayCell
                key={day.date}
                date={day.date}
                isToday={index === 0}
                label={`${index === 0 ? 'Today, ' : ''}${formatFullDate(day.date)}: ${what}`}
              >
                {day.type === 'rest' ? (
                  <Badge variant="secondary" className="text-[0.625rem]">
                    Rest
                  </Badge>
                ) : day.type === 'template' ? (
                  <span className="block w-full truncate text-xs font-medium" title={day.templateName}>
                    {day.templateName}
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground">—</span>
                )}
              </DayCell>
            );
          })}
        </WeekRail>
      </CardContent>
    </Card>
  );
}

function PastWeekCard({ days }: { days: WeekHistoryDay[] }) {
  const workouts = days.filter((d) => d.status === 'workout').length;
  const rests = days.filter((d) => d.status === 'rest').length;
  const totalSets = days.reduce((sum, d) => sum + d.setCount, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Last seven days</CardTitle>
        <p className="text-sm text-muted-foreground">
          {workouts} workout{workouts === 1 ? '' : 's'}, {rests} rest day
          {rests === 1 ? '' : 's'}, {totalSets} set{totalSets === 1 ? '' : 's'} logged
        </p>
      </CardHeader>
      <CardContent>
        <WeekRail>
          {days.map((day) => {
            const what =
              day.status === 'workout'
                ? `${day.setCount} set${day.setCount === 1 ? '' : 's'} logged`
                : day.status === 'rest'
                  ? 'Rest day'
                  : 'Nothing logged';
            return (
              <DayCell
                key={day.date}
                date={day.date}
                to={`/today?date=${day.date}`}
                label={`${formatFullDate(day.date)}: ${what}. Log a set for this day.`}
              >
                {day.status === 'workout' ? (
                  <span className="inline-flex items-center gap-1 text-xs font-semibold tabular-nums">
                    <CheckIcon className="size-3 text-success" />
                    {day.setCount}
                  </span>
                ) : day.status === 'rest' ? (
                  <Badge variant="secondary" className="text-[0.625rem]">
                    Rest
                  </Badge>
                ) : (
                  <span className="text-xs text-muted-foreground">—</span>
                )}
              </DayCell>
            );
          })}
        </WeekRail>
      </CardContent>
    </Card>
  );
}

/** "2 of 3 sets" plus a bar, when the template names a set target. */
function SetProgress({ done, target }: { done: number; target: number }) {
  const pct = Math.min(100, Math.round((done / target) * 100));
  const complete = done >= target;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className={cn('font-medium tabular-nums', complete ? 'text-success' : 'text-muted-foreground')}>
          {done} of {target} sets
        </span>
        {complete ? (
          <span className="inline-flex items-center gap-1 font-medium text-success">
            <CheckIcon className="size-3" aria-hidden="true" />
            Done
          </span>
        ) : null}
      </div>
      <div
        role="progressbar"
        aria-valuenow={done}
        aria-valuemin={0}
        aria-valuemax={target}
        aria-label={`${done} of ${target} sets logged`}
        className="h-1.5 overflow-hidden rounded-full bg-muted"
      >
        <div
          className={cn(
            'h-full rounded-full transition-[width] duration-(--dur-slow) ease-(--ease-quint)',
            complete ? 'bg-success' : 'bg-brand-strong',
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export default function Today({ loaderData }: Route.ComponentProps) {
  const { date, todayStr, isToday, plan, loggedSets, allExercises, upcomingWeek, pastWeek, weightUnit, distanceUnit } =
    loaderData;
  const prevDate = DateOnly.parse(date).minusDays(1).value;
  const nextDate = DateOnly.parse(date).plusDays(1).value;
  const dayWord = isToday ? 'today' : 'that day';
  const navigate = useNavigate();
  const [calendarOpen, setCalendarOpen] = useState(false);

  function goToDate(dateStr: string) {
    setCalendarOpen(false);
    navigate(dateStr === todayStr ? '/today' : `/today?date=${dateStr}`);
  }

  const setsByExercise = new Map<string, typeof loggedSets>();
  for (const set of loggedSets) {
    const list = setsByExercise.get(set.exerciseId) ?? [];
    list.push(set);
    setsByExercise.set(set.exerciseId, list);
  }

  // Exercises already shown by the template grid above, so the section at the
  // bottom can list only what that grid does not cover.
  const plannedExerciseIds = new Set(plan.type === 'template' ? plan.items.map((item) => item.exerciseId) : []);
  const extraEntries = [...setsByExercise.entries()].filter(([exerciseId]) => !plannedExerciseIds.has(exerciseId));

  const planLabel = plan.type === 'template' ? plan.templateName : plan.type === 'rest' ? 'Rest day' : 'No active routine';

  return (
    <Page>
      <PageHeader
        title={isToday ? 'Today' : 'Log a workout'}
        description={formatFullDate(date)}
        badge={
          plan.type === 'rest' ? (
            <Badge variant="secondary">
              <MoonIcon aria-hidden="true" />
              Rest day
            </Badge>
          ) : plan.type === 'template' ? (
            <Badge variant="brand-subtle">{planLabel}</Badge>
          ) : null
        }
        actions={
          <div className="flex items-center gap-1.5">
            <Button asChild variant="outline" size="icon-sm">
              <Link to={`/today?date=${prevDate}`} aria-label={`Go to ${formatFullDate(prevDate)}`}>
                <ChevronLeftIcon aria-hidden="true" />
              </Link>
            </Button>
            <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" size="icon-sm" aria-label="Choose a day">
                  <CalendarIcon aria-hidden="true" />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="center" className="w-auto">
                <Calendar selected={date} today={todayStr} maxDate={todayStr} onSelect={goToDate} />
                <div className="mt-3 border-t border-border pt-3">
                  <Button
                    variant="secondary"
                    size="sm"
                    className="w-full"
                    disabled={isToday}
                    onClick={() => goToDate(todayStr)}
                  >
                    Today
                  </Button>
                </div>
              </PopoverContent>
            </Popover>
            {isToday ? (
              <Button variant="outline" size="icon-sm" disabled aria-label="No later days to show">
                <ChevronRightIcon aria-hidden="true" />
              </Button>
            ) : (
              <Button asChild variant="outline" size="icon-sm">
                <Link to={`/today?date=${nextDate}`} aria-label={`Go to ${formatFullDate(nextDate)}`}>
                  <ChevronRightIcon aria-hidden="true" />
                </Link>
              </Button>
            )}
          </div>
        }
      />

      <div className="mt-(--section-gap) grid gap-4 lg:grid-cols-2">
        <UpcomingWeekCard days={upcomingWeek} />
        <PastWeekCard days={pastWeek} />
      </div>

      {plan.type === 'template' ? (
        <Section
          title={isToday ? "Today's workout" : "That day's workout"}
          description={`${plan.items.length} exercise${plan.items.length === 1 ? '' : 's'} in ${plan.templateName}.`}
        >
          <div className="stagger grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {plan.items.map((item) => {
              const done = setsByExercise.get(item.exerciseId)?.length ?? 0;
              return (
                <Card key={item.exerciseId}>
                  <CardHeader>
                    <div className="flex items-center justify-between gap-2">
                      <CardTitle className="text-base">{item.exerciseName}</CardTitle>
                      <ExerciseHistoryButton
                        exerciseId={item.exerciseId}
                        exerciseName={item.exerciseName}
                        todayStr={todayStr}
                      />
                    </div>
                    {item.targetSummary ? (
                      <p className="text-sm text-muted-foreground tabular-nums">Target: {item.targetSummary}</p>
                    ) : null}
                  </CardHeader>
                  <CardContent className="flex flex-col gap-4">
                    {item.targetSets ? <SetProgress done={done} target={item.targetSets} /> : null}
                    <LoggedSetsList sets={setsByExercise.get(item.exerciseId) ?? []} date={date} />
                    <LogSetForm
                      exercise={{
                        id: item.exerciseId,
                        name: item.exerciseName,
                        exerciseType: item.exerciseType,
                        equipmentCardioKinds: item.equipmentCardioKinds,
                      }}
                      date={date}
                      todayStr={todayStr}
                      weightUnit={weightUnit}
                      distanceUnit={distanceUnit}
                    />
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </Section>
      ) : null}

      <Section
        title={plan.type === 'rest' ? 'Log a workout anyway' : 'Log an exercise'}
        description={
          plan.type === 'none'
            ? `No routine is active, so log whatever you like for ${dayWord}.`
            : plan.type === 'rest'
              ? `${isToday ? 'Today is' : 'That day was'} scheduled as rest, but nothing stops you.`
              : `Anything outside ${isToday ? "today's" : "that day's"} template goes here.`
        }
      >
        <Card className="max-w-2xl">
          <CardContent>
            <LogSetForm
              exerciseOptions={allExercises.map((e) => ({
                id: e.id,
                name: e.name,
                exerciseType: e.exerciseType,
                equipmentCardioKinds: e.equipment.map((item) => item.cardioKind),
              }))}
              date={date}
              todayStr={todayStr}
              weightUnit={weightUnit}
              distanceUnit={distanceUnit}
            />
          </CardContent>
        </Card>
      </Section>

      {
        // Anything logged that day that its template does not cover. Without
        // this, sets for an off-template exercise were logged successfully and
        // then displayed nowhere at all whenever a template was active.
      }
      {extraEntries.length > 0 || plan.type !== 'template' ? (
        <Section
          title={plan.type === 'template' ? `Also logged ${dayWord}` : `Logged ${dayWord}`}
          description={
            plan.type === 'template' ? `Sets you recorded outside ${isToday ? "today's" : "that day's"} template.` : undefined
          }
        >
          {extraEntries.length > 0 ? (
            <div className="stagger grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {extraEntries.map(([exerciseId, sets]) => (
                <Card key={exerciseId}>
                  <CardHeader>
                    <CardTitle className="text-base">{sets[0].exerciseName}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <LoggedSetsList sets={sets} date={date} />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={PlusIcon}
              title="Nothing logged yet"
              description={`Sets you record ${dayWord} will appear here.`}
            />
          )}
        </Section>
      ) : null}
    </Page>
  );
}
