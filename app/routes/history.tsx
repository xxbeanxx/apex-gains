import { HistoryIcon, MoonIcon, PlusIcon } from 'lucide-react';
import { Link } from 'react-router';

import { userContext } from '~/auth/user-context';
import { HistoryCharts } from '~/components/history/history-charts';
import { Page, PageHeader, Section } from '~/components/layout/page';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '~/components/ui/card';
import { EmptyState } from '~/components/ui/empty-state';
import { formatFullDate, formatMonthYear } from '~/lib/format';

import { progressServiceContext } from '~/lib/nest-bridge.server';

import type { Route } from './+types/history';

export function meta() {
  return [{ title: 'History - Apex Gains' }];
}

export async function loader({ context }: Route.LoaderArgs) {
  const athlete = context.get(userContext)!;
  const progressService = context.get(progressServiceContext);
  return await progressService.history(athlete);
}

export default function History({ loaderData }: Route.ComponentProps) {
  const {
    timeline,
    totalSets,
    workoutCount,
    heatmap,
    weeklySets,
    weeklyTonnage,
    exerciseProgress,
    muscleBalance,
    personalRecords,
    bodyWeight,
  } = loaderData;

  const hasTrends = timeline.length > 0 || bodyWeight != null;

  // Group consecutive days under a month heading. Days arrive newest-first,
  // so a simple run-length pass is enough.
  const groups: Array<{ month: string; sessions: typeof timeline }> = [];
  for (const session of timeline) {
    const month = formatMonthYear(session.date);
    const last = groups.at(-1);
    if (last?.month === month) last.sessions.push(session);
    else groups.push({ month, sessions: [session] });
  }

  return (
    <Page>
      <PageHeader
        title="History"
        description={
          timeline.length > 0
            ? `${workoutCount} workout${workoutCount === 1 ? '' : 's'} and ${totalSets} set${totalSets === 1 ? '' : 's'} across ${timeline.length} recorded day${timeline.length === 1 ? '' : 's'}.`
            : 'Every session you record shows up here, rest days included.'
        }
      />

      {hasTrends ? (
        <Section title="Trends">
          <HistoryCharts
            heatmap={heatmap}
            weeklySets={weeklySets}
            weeklyTonnage={weeklyTonnage}
            exerciseProgress={exerciseProgress}
            muscleBalance={muscleBalance}
            personalRecords={personalRecords}
            bodyWeight={bodyWeight}
          />
        </Section>
      ) : null}

      {timeline.length === 0 ? (
        <div className="mt-(--section-gap)">
          <EmptyState
            icon={HistoryIcon}
            title="No history yet"
            description="Log your first set on the Today page and it will appear here."
          />
        </div>
      ) : null}

      {groups.map((group) => (
        <section key={group.month} aria-label={group.month} className="mt-(--section-gap) flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <h2 className="font-heading text-sm font-semibold tracking-wide text-muted-foreground uppercase">{group.month}</h2>
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
              const isRest = session.isRestDay && session.sets.length === 0;

              return (
                <Card key={session.id}>
                  <CardHeader>
                    <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                      {formatFullDate(session.date)}
                    </CardTitle>
                    <CardAction>
                      <Button asChild variant="ghost" size="icon-sm">
                        <Link to={`/today?date=${session.date}`} aria-label={`Add sets for ${formatFullDate(session.date)}`}>
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
                            {session.sets.length === 1 ? '' : 's'}
                          </Badge>
                          <Badge variant="outline">
                            {setsByExercise.size} exercise
                            {setsByExercise.size === 1 ? '' : 's'}
                          </Badge>
                        </>
                      ) : null}
                    </div>
                  </CardHeader>
                  {setsByExercise.size > 0 ? (
                    <CardContent>
                      <dl className="flex flex-col gap-2.5">
                        {[...setsByExercise.entries()].map(([exerciseId, sets]) => (
                          <div key={exerciseId} className="flex flex-col">
                            <dt className="font-medium">{sets[0].exerciseName}</dt>
                            <dd className="text-sm text-muted-foreground tabular-nums">
                              {sets.map((s) => s.summary).join(' · ')}
                            </dd>
                          </div>
                        ))}
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
