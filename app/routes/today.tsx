import { useState } from 'react';

import { Link, useNavigate } from 'react-router';

import { Expose, Transform } from 'class-transformer';
import { IsInt, IsNumber, IsOptional, IsPositive, IsString, IsUUID, MaxLength } from 'class-validator';
import { CalendarIcon, ChevronLeftIcon, ChevronRightIcon, MoonIcon, PlusIcon } from 'lucide-react';

import { requireAthlete } from '~/auth/user-context';
import { Page, PageHeader, Section } from '~/components/layout/page';
import { ExerciseHistoryButton } from '~/components/session/exercise-history-button';
import { LogSetForm } from '~/components/session/log-set-form';
import { LoggedSetsList } from '~/components/session/logged-sets-list';
import { RestTimer } from '~/components/session/rest-timer';
import { SetProgress } from '~/components/session/set-progress';
import { PastWeekCard, UpcomingWeekCard } from '~/components/session/week-rail';
import { TargetChips } from '~/components/target-chips';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { Calendar } from '~/components/ui/calendar';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';
import { EmptyState } from '~/components/ui/empty-state';
import { Popover, PopoverContent, PopoverTrigger } from '~/components/ui/popover';
import { intent } from '~/lib/intent';
import { dispatch, handled } from '~/lib/intent.server';
import { requestLogger } from '~/lib/logger';
import { cn } from '~/lib/utils';
import { IsDateOnly, IsRpe, optionalTrim, toOptionalNumber } from '~/lib/validate-form';
import { exerciseLibraryServiceContext, sessionServiceContext, trainingPlanServiceContext } from '~/router/load-context';
import { DateOnly } from '~domain/values/date-only';
import { formatFullDate } from '~shared/format';

import type { Route } from './+types/today';

export function meta() {
  return [{ title: 'Today - Apex Gains' }];
}

export const handle = { crumb: () => ({ label: 'Today' }) };

export async function loader({ request, context }: Route.LoaderArgs) {
  const athlete = requireAthlete(context);
  const today = DateOnly.today(new Date(), athlete.preferences.timezone);

  // An unparseable or future ?date falls back to today rather than erroring -
  // there is nothing to log against a day that hasn't happened.
  const requested = DateOnly.tryParse(new URL(request.url).searchParams.get('date'));
  const date = requested?.isOnOrBefore(today) ? requested : today;

  const planService = context.get(trainingPlanServiceContext);
  const logService = context.get(sessionServiceContext);
  const libraryService = context.get(exerciseLibraryServiceContext);

  const [plan, loggedSets, allExercises, upcomingWeek, pastWeek, lastSets] = await Promise.all([
    planService.planFor(athlete, date),
    logService.loggedSetsFor(athlete, date),
    libraryService.listExercises(athlete),
    planService.upcomingWeek(athlete, today),
    planService.pastWeek(athlete, today),
    logService.lastSetsFor(athlete, date),
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
    lastSets,
    weightUnit: athlete.preferences.weightUnit,
    distanceUnit: athlete.preferences.distanceUnit,
    defaultRestSeconds: athlete.preferences.restDuration?.inSeconds ?? null,
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

  @Expose()
  @Transform(optionalTrim())
  @IsOptional()
  @IsString()
  @MaxLength(500)
  readonly notes?: string;

  @Expose()
  @Transform(toOptionalNumber())
  @IsOptional()
  @IsRpe()
  readonly rpe?: number;
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
  const today = DateOnly.today(new Date(), athlete.preferences.timezone);
  const logService = context.get(sessionServiceContext);

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
        notes: input.notes,
        rpe: input.rpe,
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

/** The two week rails, shared by the always-visible desktop copy and the collapsed mobile one. */
function WeekOverview({
  upcomingWeek,
  pastWeek,
}: {
  upcomingWeek: Route.ComponentProps['loaderData']['upcomingWeek'];
  pastWeek: Route.ComponentProps['loaderData']['pastWeek'];
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <UpcomingWeekCard days={upcomingWeek} />
      <PastWeekCard days={pastWeek} />
    </div>
  );
}

export default function Today({ loaderData }: Route.ComponentProps) {
  const {
    date,
    todayStr,
    isToday,
    plan,
    loggedSets,
    allExercises,
    upcomingWeek,
    pastWeek,
    lastSets,
    weightUnit,
    distanceUnit,
    defaultRestSeconds,
  } = loaderData;
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

  // Exercises already shown by the workout grid above, so the section at the
  // bottom can list only what that grid does not cover.
  const plannedExerciseIds = new Set(plan.type === 'workout' ? plan.items.map((item) => item.exerciseId) : []);
  const extraEntries = [...setsByExercise.entries()].filter(([exerciseId]) => !plannedExerciseIds.has(exerciseId));

  const planLabel = plan.type === 'workout' ? plan.workoutName : plan.type === 'rest' ? 'Rest day' : 'No active plan';

  return (
    <Page>
      <PageHeader
        title={isToday ? 'Today' : 'Log a session'}
        description={formatFullDate(date)}
        badge={
          plan.type === 'rest' ? (
            <Badge variant="secondary">
              <MoonIcon aria-hidden="true" />
              Rest day
            </Badge>
          ) : plan.type === 'workout' ? (
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

      {plan.type === 'workout' ? (
        <Section
          title={isToday ? "Today's session" : "That day's session"}
          description={`${plan.items.length} exercise${plan.items.length === 1 ? '' : 's'} in ${plan.workoutName}.`}
          className="mt-(--section-gap)"
        >
          <div className="stagger grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {plan.items.map((item) => {
              const done = setsByExercise.get(item.exerciseId)?.length ?? 0;
              const complete = item.target?.sets != null && done >= item.target.sets;
              const form = (
                <LogSetForm
                  logSet={intents.logSet}
                  exercise={{
                    id: item.exerciseId,
                    name: item.exerciseName,
                    exerciseType: item.exerciseType,
                    cardioFields: item.cardioFields,
                  }}
                  date={date}
                  todayStr={todayStr}
                  weightUnit={weightUnit}
                  distanceUnit={distanceUnit}
                  loggedSets={loggedSets}
                  lastSets={lastSets}
                />
              );

              return (
                <Card key={item.exerciseId} className={cn(complete && 'border-brand-strong')}>
                  <CardHeader>
                    <div className="flex items-center justify-between gap-2">
                      <CardTitle className="text-base">{item.exerciseName}</CardTitle>
                      <ExerciseHistoryButton
                        exerciseId={item.exerciseId}
                        exerciseName={item.exerciseName}
                        todayStr={todayStr}
                      />
                    </div>
                    {item.target ? (
                      <div className="mt-1 flex flex-wrap gap-1">
                        <TargetChips target={item.target} />
                      </div>
                    ) : null}
                  </CardHeader>
                  <CardContent className="flex flex-col gap-4">
                    {item.target?.sets ? <SetProgress done={done} target={item.target.sets} /> : null}
                    <LoggedSetsList
                      sets={setsByExercise.get(item.exerciseId) ?? []}
                      date={date}
                      removeSet={intents.removeSet}
                    />
                    <RestTimer
                      exerciseId={item.exerciseId}
                      restSeconds={item.target?.restSeconds ?? defaultRestSeconds}
                      signal={done}
                    />
                    {complete ? (
                      // The common case once a card is complete is *not*
                      // logging another set - collapse the form rather than
                      // leaving it open by default.
                      <details>
                        <summary
                          role="button"
                          className="flex cursor-pointer items-center gap-1 text-sm font-medium text-muted-foreground select-none [&::-webkit-details-marker]:hidden [details[open]_&]:text-foreground"
                        >
                          <ChevronRightIcon
                            className="size-3.5 transition-transform duration-(--dur-fast) [details[open]_&]:rotate-90"
                            aria-hidden="true"
                          />
                          Log another set
                        </summary>
                        <div className="mt-3">{form}</div>
                      </details>
                    ) : (
                      form
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </Section>
      ) : null}

      <Section
        title={plan.type === 'rest' ? 'Log a session anyway' : 'Log an exercise'}
        description={
          plan.type === 'none'
            ? `No plan is active, so log whatever you like for ${dayWord}.`
            : plan.type === 'rest'
              ? `${isToday ? 'Today is' : 'That day was'} scheduled as rest, but nothing stops you.`
              : `Anything outside ${isToday ? "today's" : "that day's"} workout goes here.`
        }
      >
        <Card className="max-w-2xl">
          <CardContent>
            <LogSetForm
              logSet={intents.logSet}
              exerciseOptions={allExercises.map((e) => ({
                id: e.id,
                name: e.name,
                exerciseType: e.exerciseType,
                cardioFields: e.cardioFields,
              }))}
              date={date}
              todayStr={todayStr}
              weightUnit={weightUnit}
              distanceUnit={distanceUnit}
              loggedSets={loggedSets}
              lastSets={lastSets}
            />
          </CardContent>
        </Card>
      </Section>

      {
        // Anything logged that day that its workout does not cover. Without
        // this, sets for an off-workout exercise were logged successfully and
        // then displayed nowhere at all whenever a workout was active.
      }
      {extraEntries.length > 0 || plan.type !== 'workout' ? (
        <Section
          title={plan.type === 'workout' ? `Also logged ${dayWord}` : `Logged ${dayWord}`}
          description={
            plan.type === 'workout' ? `Sets you recorded outside ${isToday ? "today's" : "that day's"} workout.` : undefined
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
                    <LoggedSetsList sets={sets} date={date} removeSet={intents.removeSet} />
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

      {
        // The rails are the least actionable thing on the page - useful for
        // orientation, not for logging - so they sink to the bottom and, on
        // a phone, start collapsed behind a single disclosure rather than
        // pushing the log form below the fold. A closed <details> hides its
        // content by the HTML rendering rules, not by a CSS `display` that
        // author styles could override - there is no way to make one element
        // open at `md:` and closed below it, so `md:` gets its own
        // permanently-expanded copy instead, `md:hidden` below it hands off
        // to the collapsible one. Both read the same two cards; only one is
        // ever visible at a given width.
      }
      <div className="mt-(--section-gap) hidden md:block">
        <WeekOverview upcomingWeek={upcomingWeek} pastWeek={pastWeek} />
      </div>
      <details className="mt-(--section-gap) md:hidden">
        <summary
          role="button"
          className="flex cursor-pointer items-center gap-1 text-sm font-medium text-muted-foreground select-none [&::-webkit-details-marker]:hidden [details[open]_&]:text-foreground"
        >
          <ChevronRightIcon
            className="size-3.5 transition-transform duration-(--dur-fast) [details[open]_&]:rotate-90"
            aria-hidden="true"
          />
          This week
        </summary>
        <div className="mt-3">
          <WeekOverview upcomingWeek={upcomingWeek} pastWeek={pastWeek} />
        </div>
      </details>
    </Page>
  );
}
