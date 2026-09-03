import { HistoryIcon, MoonIcon, PlusIcon } from "lucide-react";
import { Link } from "react-router";

import { userContext } from "~/auth/user-context";
import { HistoryCharts } from "~/components/history/history-charts";
import { Page, PageHeader, Section } from "~/components/layout/page";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { EmptyState } from "~/components/ui/empty-state";
import { formatFullDate } from "~/lib/cycle";
import {
  computeExerciseProgressSeries,
  computeWeeklyVolume,
} from "~/lib/history-charts.server";
import { getWorkoutSessionsRepository } from "~/repositories/workout-sessions-repository.server";

import type { Route } from "./+types/history";

export function meta() {
  return [{ title: "History - Apex Gains" }];
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

/** "2026-09-02" -> "September 2026", for the timeline dividers. */
function monthLabel(dateStr: string) {
  const [year, month] = dateStr.split("-").map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
}

const CHART_HISTORY_LIMIT = 180;
const TIMELINE_LIMIT = 90;
const VOLUME_WEEKS = 12;

export async function loader({ context }: Route.LoaderArgs) {
  const user = context.get(userContext)!;
  const workoutSessionsRepository = await getWorkoutSessionsRepository();
  const chartSessions = await workoutSessionsRepository.listRecentWithSetsForUser(
    user.id,
    CHART_HISTORY_LIMIT,
  );

  return {
    sessions: chartSessions.slice(0, TIMELINE_LIMIT),
    weeklyVolume: computeWeeklyVolume(chartSessions, VOLUME_WEEKS),
    exerciseProgress: computeExerciseProgressSeries(chartSessions),
  };
}

export default function History({ loaderData }: Route.ComponentProps) {
  const { sessions, weeklyVolume, exerciseProgress } = loaderData;

  const totalSets = sessions.reduce((sum, s) => sum + s.sets.length, 0);
  const workoutCount = sessions.filter((s) => s.sets.length > 0).length;

  // Group consecutive sessions under a month heading. Sessions arrive
  // newest-first, so a simple run-length pass is enough.
  const groups: Array<{ month: string; sessions: typeof sessions }> = [];
  for (const session of sessions) {
    const month = monthLabel(session.date);
    const last = groups.at(-1);
    if (last?.month === month) last.sessions.push(session);
    else groups.push({ month, sessions: [session] });
  }

  return (
    <Page>
      <PageHeader
        title="History"
        description={
          sessions.length > 0
            ? `${workoutCount} workout${workoutCount === 1 ? "" : "s"} and ${totalSets} set${totalSets === 1 ? "" : "s"} across ${sessions.length} recorded day${sessions.length === 1 ? "" : "s"}.`
            : "Every session you record shows up here, rest days included."
        }
      />

      {sessions.length > 0 ? (
        <Section title="Trends">
          <HistoryCharts
            weeklyVolume={weeklyVolume}
            exerciseProgress={exerciseProgress}
          />
        </Section>
      ) : null}

      {sessions.length === 0 ? (
        <div className="mt-(--section-gap)">
          <EmptyState
            icon={HistoryIcon}
            title="No history yet"
            description="Log your first set on the Today page and it will appear here."
          />
        </div>
      ) : null}

      {groups.map((group) => (
        <section
          key={group.month}
          aria-label={group.month}
          className="mt-(--section-gap) flex flex-col gap-4"
        >
          <div className="flex items-center gap-3">
            <h2 className="font-heading text-sm font-semibold tracking-wide text-muted-foreground uppercase">
              {group.month}
            </h2>
            <span aria-hidden="true" className="h-px flex-1 bg-border" />
          </div>

          <div className="stagger grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {group.sessions.map((session) => {
              const setsByExercise = new Map<string, typeof session.sets>();
              for (const set of session.sets) {
                const list = setsByExercise.get(set.exerciseId) ?? [];
                list.push(set);
                setsByExercise.set(set.exerciseId, list);
              }
              const isRest =
                session.isRestDay && session.sets.length === 0;

              return (
                <Card key={session.id}>
                  <CardHeader>
                    <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                      {formatFullDate(session.date)}
                    </CardTitle>
                    <CardAction>
                      <Button asChild variant="ghost" size="icon-sm">
                        <Link
                          to={`/today?date=${session.date}`}
                          aria-label={`Add sets for ${formatFullDate(session.date)}`}
                        >
                          <PlusIcon aria-hidden="true" />
                        </Link>
                      </Button>
                    </CardAction>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {isRest ? (
                        <Badge variant="secondary">
                          <MoonIcon aria-hidden="true" />
                          Rest
                        </Badge>
                      ) : null}
                      {session.sets.length > 0 ? (
                        <>
                          <Badge variant="brand-subtle">
                            {session.sets.length} set
                            {session.sets.length === 1 ? "" : "s"}
                          </Badge>
                          <Badge variant="outline">
                            {setsByExercise.size} exercise
                            {setsByExercise.size === 1 ? "" : "s"}
                          </Badge>
                        </>
                      ) : null}
                    </div>
                  </CardHeader>
                  {setsByExercise.size > 0 ? (
                    <CardContent>
                      <dl className="flex flex-col gap-2.5">
                        {[...setsByExercise.entries()].map(
                          ([exerciseId, sets]) => (
                            <div key={exerciseId} className="flex flex-col">
                              <dt className="font-medium">
                                {sets[0].exercise.name}
                              </dt>
                              <dd className="text-sm text-muted-foreground tabular-nums">
                                {sets.map((s) => setSummary(s)).join(" · ")}
                              </dd>
                            </div>
                          )
                        )}
                      </dl>
                    </CardContent>
                  ) : null}
                </Card>
              );
            })}
          </div>
        </section>
      ))}
    </Page>
  );
}
