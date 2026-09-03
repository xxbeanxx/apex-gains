import { and, asc, eq } from "drizzle-orm";
import {
  CalendarIcon,
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  MoonIcon,
  PlusIcon,
  XIcon,
} from "lucide-react";
import { useState } from "react";
import { data, Link, useFetcher, useNavigate } from "react-router";
import { z } from "zod";

import { userContext } from "~/auth/user-context";
import { Page, PageHeader, Section } from "~/components/layout/page";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Calendar } from "~/components/ui/calendar";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { EmptyState } from "~/components/ui/empty-state";
import { Field } from "~/components/ui/field";
import { Input } from "~/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "~/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { SubmitButton } from "~/components/ui/submit-button";
import { db } from "~/db/index.server";
import { type Exercise, exercises, sessionSets } from "~/db/schema";
import {
  addDays,
  formatFullDate,
  formatMonthDay,
  formatWeekday,
  isValidDateString,
  todayDateString,
} from "~/lib/cycle";
import { loggerContext } from "~/lib/logger.server";
import { cn } from "~/lib/utils";
import {
  getOrCreateSession,
  getTodaysPlan,
  type TodaysPlanItem,
} from "~/lib/todays-plan.server";
import {
  getPastWeekSummary,
  getUpcomingWeekPlan,
  type WeekHistoryDay,
  type WeekPlanDay,
} from "~/lib/week-summary.server";

import type { Route } from "./+types/today";

export function meta() {
  return [{ title: "Today - Apex Gains" }];
}

function targetSummary(item: TodaysPlanItem) {
  const parts: string[] = [];
  if (item.targetSets && item.targetReps) {
    parts.push(`${item.targetSets} x ${item.targetReps}`);
  }
  if (item.targetWeight) parts.push(`${item.targetWeight} lb`);
  if (item.targetDurationSeconds) {
    parts.push(`${Math.round(item.targetDurationSeconds / 60)} min`);
  }
  if (item.targetSpeed) parts.push(`${item.targetSpeed} speed`);
  if (item.targetResistance) parts.push(`resistance ${item.targetResistance}`);
  return parts.length > 0 ? `Target: ${parts.join(", ")}` : null;
}

function setSummary(set: {
  reps: number | null;
  weight: string | null;
  durationSeconds: number | null;
  speed: string | null;
  resistanceLevel: number | null;
}) {
  const parts: string[] = [];
  if (set.weight && set.reps) parts.push(`${set.weight} lb x ${set.reps}`);
  else if (set.reps) parts.push(`${set.reps} reps`);
  if (set.durationSeconds) {
    parts.push(`${Math.round(set.durationSeconds / 60)} min`);
  }
  if (set.speed) parts.push(`${set.speed} speed`);
  if (set.resistanceLevel) parts.push(`resistance ${set.resistanceLevel}`);
  return parts.join(", ");
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const user = context.get(userContext)!;
  const todayStr = todayDateString();
  const requestedDate = new URL(request.url).searchParams.get("date");
  const dateStr =
    requestedDate &&
    isValidDateString(requestedDate) &&
    requestedDate <= todayStr
      ? requestedDate
      : todayStr;
  const isToday = dateStr === todayStr;
  const plan = await getTodaysPlan(user.id, dateStr);

  const session = await db.query.workoutSessions.findFirst({
    where: (ws, { and, eq }) =>
      and(eq(ws.userId, user.id), eq(ws.date, dateStr)),
    with: {
      sets: { with: { exercise: true }, orderBy: (s, { asc }) => asc(s.createdAt) },
    },
  });

  const allExercises = await db
    .select()
    .from(exercises)
    .orderBy(asc(exercises.name));

  const [upcomingWeek, pastWeek] = await Promise.all([
    getUpcomingWeekPlan(user.id, todayStr),
    getPastWeekSummary(user.id, todayStr),
  ]);

  return {
    date: dateStr,
    todayStr,
    isToday,
    plan,
    loggedSets: session?.sets ?? [],
    allExercises,
    upcomingWeek,
    pastWeek,
  };
}

const logSetSchema = z.object({
  exerciseId: z.uuid(),
  date: z.string().refine(isValidDateString),
  reps: z.coerce.number().int().positive().optional(),
  weight: z.coerce.number().positive().optional(),
  durationMinutes: z.coerce.number().positive().optional(),
  speed: z.coerce.number().positive().optional(),
  resistance: z.coerce.number().int().positive().optional(),
});

export async function action({ request, context }: Route.ActionArgs) {
  const user = context.get(userContext)!;
  const todayStr = todayDateString();
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "logSet") {
    // Blank optional fields arrive as "", which z.coerce.number() reads as 0
    // (failing .positive()) rather than as absent - drop them so they parse
    // as undefined instead.
    const raw = Object.fromEntries(
      [...formData].filter(([, value]) => value !== ""),
    );
    const result = logSetSchema.safeParse(raw);
    if (!result.success) {
      return data({ error: "Invalid set" }, { status: 400 });
    }
    // Clamp instead of rejecting: a stale form (left open since yesterday)
    // should still log against today rather than fail outright.
    const dateStr = result.data.date <= todayStr ? result.data.date : todayStr;

    const plan = await getTodaysPlan(user.id, dateStr);
    const session = await getOrCreateSession(
      user.id,
      dateStr,
      plan,
      context.get(loggerContext),
    );

    const existingSets = await db
      .select()
      .from(sessionSets)
      .where(
        and(
          eq(sessionSets.sessionId, session.id),
          eq(sessionSets.exerciseId, result.data.exerciseId),
        ),
      );

    await db.insert(sessionSets).values({
      sessionId: session.id,
      exerciseId: result.data.exerciseId,
      setNumber: existingSets.length + 1,
      reps: result.data.reps ?? null,
      weight: result.data.weight?.toString() ?? null,
      durationSeconds: result.data.durationMinutes
        ? Math.round(result.data.durationMinutes * 60)
        : null,
      speed: result.data.speed?.toString() ?? null,
      resistanceLevel: result.data.resistance ?? null,
    });
    return { ok: true };
  }

  if (intent === "removeSet") {
    const setId = String(formData.get("setId"));
    const set = await db.query.sessionSets.findFirst({
      where: eq(sessionSets.id, setId),
      with: { session: true },
    });
    if (set && set.session.userId === user.id) {
      await db.delete(sessionSets).where(eq(sessionSets.id, setId));
    }
    return { ok: true };
  }

  return data({ error: "Unknown action" }, { status: 400 });
}

function LogSetForm({
  exercise,
  exerciseOptions,
  date,
}: {
  exercise?: Exercise;
  exerciseOptions?: Exercise[];
  date: string;
}) {
  const fetcher = useFetcher();
  const [selectedId, setSelectedId] = useState(exercise?.id ?? "");
  const active =
    exercise ?? exerciseOptions?.find((e) => e.id === selectedId);
  const pending = fetcher.state !== "idle";
  const error =
    fetcher.data && "error" in fetcher.data ? fetcher.data.error : null;

  return (
    <fetcher.Form method="post" className="flex flex-col gap-3">
      <input type="hidden" name="intent" value="logSet" />
      <input type="hidden" name="date" value={date} />
      {exercise ? (
        <input type="hidden" name="exerciseId" value={exercise.id} />
      ) : (
        <Field label="Exercise" className="sm:max-w-xs">
          {({ id }) => (
            <Select
              name="exerciseId"
              value={selectedId}
              onValueChange={setSelectedId}
            >
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

      {active?.exerciseType === "strength" ? (
        <div className="grid grid-cols-2 gap-3 sm:max-w-xs">
          <Field label="Reps">
            <Input name="reps" type="number" min={1} inputMode="numeric" />
          </Field>
          <Field label="Weight">
            <Input
              name="weight"
              type="number"
              min={0}
              step="0.5"
              inputMode="decimal"
            />
          </Field>
        </div>
      ) : null}

      {active?.exerciseType === "cardio" ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:max-w-md">
          <Field label="Minutes">
            <Input
              name="durationMinutes"
              type="number"
              min={1}
              inputMode="numeric"
            />
          </Field>
          <Field label="Speed">
            <Input
              name="speed"
              type="number"
              min={0}
              step="0.1"
              inputMode="decimal"
            />
          </Field>
          <Field label="Resistance">
            <Input
              name="resistance"
              type="number"
              min={1}
              inputMode="numeric"
            />
          </Field>
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

function LoggedSetsList({
  sets,
}: {
  sets: Array<{
    id: string;
    reps: number | null;
    weight: string | null;
    durationSeconds: number | null;
    speed: string | null;
    resistanceLevel: number | null;
  }>;
}) {
  if (sets.length === 0) return null;
  return (
    <ol className="flex flex-col gap-1.5">
      {sets.map((set, index) => (
        <li
          key={set.id}
          className="flex items-center gap-2.5 rounded-lg bg-muted/60 py-1.5 pr-1.5 pl-2.5 text-sm"
        >
          <span
            aria-hidden="true"
            className="flex size-5 shrink-0 items-center justify-center rounded-md bg-brand-muted text-[0.6875rem] font-semibold text-brand-strong tabular-nums"
          >
            {index + 1}
          </span>
          <span className="min-w-0 flex-1 truncate tabular-nums">
            <span className="sr-only">Set {index + 1}: </span>
            {setSummary(set)}
          </span>
          <form method="post" className="contents">
            <input type="hidden" name="intent" value="removeSet" />
            <input type="hidden" name="setId" value={set.id} />
            <button
              type="submit"
              className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors duration-(--dur-fast) hover:bg-destructive/10 hover:text-destructive pointer-coarse:size-8"
            >
              <XIcon className="size-3.5" aria-hidden="true" />
              <span className="sr-only">
                Remove set {index + 1}, {setSummary(set)}
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
    "relative flex min-w-18 flex-1 flex-col items-center gap-1 rounded-xl border px-2 py-2.5 text-center transition-colors duration-(--dur)",
    isToday ? "border-brand/40 bg-brand-muted" : "border-border bg-card/50",
    to
      ? "outline-none hover:border-brand/40 hover:bg-brand-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50"
      : null
  );

  const content = (
    <>
      {isToday ? (
        <span
          aria-hidden="true"
          className="absolute inset-x-3 top-0 h-0.5 rounded-full bg-brand-strong"
        />
      ) : null}
      <span
        aria-hidden="true"
        className={cn(
          "text-xs font-medium",
          isToday ? "text-brand-strong" : "text-muted-foreground"
        )}
      >
        {formatWeekday(date)}
      </span>
      <span
        aria-hidden="true"
        className="text-[0.625rem] text-muted-foreground tabular-nums"
      >
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
  return (
    <ul className="scrollbar-none -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
      {children}
    </ul>
  );
}

function UpcomingWeekCard({ days }: { days: WeekPlanDay[] }) {
  const planned = days.filter((d) => d.type === "template").length;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Next seven days</CardTitle>
        <p className="text-sm text-muted-foreground">
          {planned} workout{planned === 1 ? "" : "s"} scheduled
        </p>
      </CardHeader>
      <CardContent>
        <WeekRail>
          {days.map((day, index) => {
            const what =
              day.type === "template"
                ? day.templateName
                : day.type === "rest"
                  ? "Rest day"
                  : "Nothing scheduled";
            return (
              <DayCell
                key={day.date}
                date={day.date}
                isToday={index === 0}
                label={`${index === 0 ? "Today, " : ""}${formatFullDate(day.date)}: ${what}`}
              >
                {day.type === "rest" ? (
                  <Badge variant="secondary" className="text-[0.625rem]">
                    Rest
                  </Badge>
                ) : day.type === "template" ? (
                  <span
                    className="block w-full truncate text-xs font-medium"
                    title={day.templateName}
                  >
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
  const workouts = days.filter((d) => d.status === "workout").length;
  const rests = days.filter((d) => d.status === "rest").length;
  const totalSets = days.reduce((sum, d) => sum + d.setCount, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Last seven days</CardTitle>
        <p className="text-sm text-muted-foreground">
          {workouts} workout{workouts === 1 ? "" : "s"}, {rests} rest day
          {rests === 1 ? "" : "s"}, {totalSets} set{totalSets === 1 ? "" : "s"}{" "}
          logged
        </p>
      </CardHeader>
      <CardContent>
        <WeekRail>
          {days.map((day) => {
            const what =
              day.status === "workout"
                ? `${day.setCount} set${day.setCount === 1 ? "" : "s"} logged`
                : day.status === "rest"
                  ? "Rest day"
                  : "Nothing logged";
            return (
              <DayCell
                key={day.date}
                date={day.date}
                to={`/today?date=${day.date}`}
                label={`${formatFullDate(day.date)}: ${what}. Log a set for this day.`}
              >
                {day.status === "workout" ? (
                  <span className="inline-flex items-center gap-1 text-xs font-semibold tabular-nums">
                    <CheckIcon className="size-3 text-success" />
                    {day.setCount}
                  </span>
                ) : day.status === "rest" ? (
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
        <span
          className={cn(
            "font-medium tabular-nums",
            complete ? "text-success" : "text-muted-foreground"
          )}
        >
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
            "h-full rounded-full transition-[width] duration-(--dur-slow) ease-(--ease-quint)",
            complete ? "bg-success" : "bg-brand-strong"
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
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
  } = loaderData;
  const prevDate = addDays(date, -1);
  const nextDate = addDays(date, 1);
  const dayWord = isToday ? "today" : "that day";
  const navigate = useNavigate();
  const [calendarOpen, setCalendarOpen] = useState(false);

  function goToDate(dateStr: string) {
    setCalendarOpen(false);
    navigate(dateStr === todayStr ? "/today" : `/today?date=${dateStr}`);
  }

  const setsByExercise = new Map<string, typeof loggedSets>();
  for (const set of loggedSets) {
    const list = setsByExercise.get(set.exerciseId) ?? [];
    list.push(set);
    setsByExercise.set(set.exerciseId, list);
  }

  // Exercises already shown by the template grid above, so the section at the
  // bottom can list only what that grid does not cover.
  const plannedExerciseIds = new Set(
    plan.type === "template" ? plan.items.map((item) => item.exercise.id) : [],
  );
  const extraEntries = [...setsByExercise.entries()].filter(
    ([exerciseId]) => !plannedExerciseIds.has(exerciseId),
  );

  const planLabel =
    plan.type === "template"
      ? plan.templateName
      : plan.type === "rest"
        ? "Rest day"
        : "No active routine";

  return (
    <Page>
      <PageHeader
        title={isToday ? "Today" : "Log a workout"}
        description={formatFullDate(date)}
        badge={
          plan.type === "rest" ? (
            <Badge variant="secondary">
              <MoonIcon aria-hidden="true" />
              Rest day
            </Badge>
          ) : plan.type === "template" ? (
            <Badge variant="brand-subtle">{planLabel}</Badge>
          ) : null
        }
        actions={
          <div className="flex items-center gap-1.5">
            <Button asChild variant="outline" size="icon-sm">
              <Link
                to={`/today?date=${prevDate}`}
                aria-label={`Go to ${formatFullDate(prevDate)}`}
              >
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
                <Calendar
                  selected={date}
                  today={todayStr}
                  maxDate={todayStr}
                  onSelect={goToDate}
                />
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
              <Button
                variant="outline"
                size="icon-sm"
                disabled
                aria-label="No later days to show"
              >
                <ChevronRightIcon aria-hidden="true" />
              </Button>
            ) : (
              <Button asChild variant="outline" size="icon-sm">
                <Link
                  to={`/today?date=${nextDate}`}
                  aria-label={`Go to ${formatFullDate(nextDate)}`}
                >
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

      {plan.type === "template" ? (
        <Section
          title={isToday ? "Today's workout" : "That day's workout"}
          description={`${plan.items.length} exercise${plan.items.length === 1 ? "" : "s"} in ${plan.templateName}.`}
        >
          <div className="stagger grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {plan.items.map((item) => {
              const done = setsByExercise.get(item.exercise.id)?.length ?? 0;
              return (
                <Card key={item.exercise.id}>
                  <CardHeader>
                    <CardTitle className="text-base">
                      {item.exercise.name}
                    </CardTitle>
                    {targetSummary(item) ? (
                      <p className="text-sm text-muted-foreground tabular-nums">
                        {targetSummary(item)}
                      </p>
                    ) : null}
                  </CardHeader>
                  <CardContent className="flex flex-col gap-4">
                    {item.targetSets ? (
                      <SetProgress done={done} target={item.targetSets} />
                    ) : null}
                    <LoggedSetsList
                      sets={setsByExercise.get(item.exercise.id) ?? []}
                    />
                    <LogSetForm exercise={item.exercise} date={date} />
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </Section>
      ) : null}

      <Section
        title={plan.type === "rest" ? "Log a workout anyway" : "Log an exercise"}
        description={
          plan.type === "none"
            ? `No routine is active, so log whatever you like for ${dayWord}.`
            : plan.type === "rest"
              ? `${isToday ? "Today is" : "That day was"} scheduled as rest, but nothing stops you.`
              : `Anything outside ${isToday ? "today's" : "that day's"} template goes here.`
        }
      >
        <Card className="max-w-2xl">
          <CardContent>
            <LogSetForm exerciseOptions={allExercises} date={date} />
          </CardContent>
        </Card>
      </Section>

      {/*
        Anything logged that day that its template does not cover. Without
        this, sets for an off-template exercise were logged successfully and
        then displayed nowhere at all whenever a template was active.
      */}
      {extraEntries.length > 0 || plan.type !== "template" ? (
        <Section
          title={
            plan.type === "template"
              ? `Also logged ${dayWord}`
              : `Logged ${dayWord}`
          }
          description={
            plan.type === "template"
              ? `Sets you recorded outside ${isToday ? "today's" : "that day's"} template.`
              : undefined
          }
        >
          {extraEntries.length > 0 ? (
            <div className="stagger grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {extraEntries.map(([exerciseId, sets]) => (
                <Card key={exerciseId}>
                  <CardHeader>
                    <CardTitle className="text-base">
                      {sets[0].exercise.name}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <LoggedSetsList sets={sets} />
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
