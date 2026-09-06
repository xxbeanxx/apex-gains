import { HistoryIcon } from 'lucide-react';

import { requireAthlete } from '~/auth/user-context';
import { HistoryCharts } from '~/components/history/history-charts';
import { SessionRow } from '~/components/history/session-row';
import { Page, PageHeader, Section } from '~/components/layout/page';
import { EmptyState } from '~/components/ui/empty-state';
import { formatMonthYear } from '~shared/format';

import { progressServiceContext } from '~/router/load-context';

import type { Route } from './+types/history';

export function meta() {
  return [{ title: 'History - Apex Gains' }];
}

export const handle = { crumb: () => ({ label: 'History' }) };

export async function loader({ context }: Route.LoaderArgs) {
  const athlete = requireAthlete(context);
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
    tonnageUnit,
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
            tonnageUnit={tonnageUnit}
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
        <section key={group.month} aria-label={group.month} className="mt-(--section-gap)">
          <div className="sticky top-(--header-h) z-10 flex items-center gap-3 bg-background py-2">
            <h2 className="font-heading text-sm font-semibold tracking-wide text-muted-foreground uppercase">{group.month}</h2>
            <span aria-hidden="true" className="h-px flex-1 bg-border" />
          </div>

          <ul className="flex flex-col divide-y divide-border">
            {group.sessions.map((session) => (
              <SessionRow key={session.id} session={session} />
            ))}
          </ul>
        </section>
      ))}
    </Page>
  );
}
