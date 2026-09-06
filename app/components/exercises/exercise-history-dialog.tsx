import { useEffect } from 'react';

import { useFetcher } from 'react-router';

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '~/components/ui/dialog';
import type { RecentSetView } from '~application/use-cases/session-service';
import { formatFullDate } from '~shared/format';

function groupSetsByDate(sets: RecentSetView[]): { date: string; summaries: string[] }[] {
  const groups: { date: string; summaries: string[] }[] = [];
  for (const set of sets) {
    const current = groups.at(-1);
    if (current && current.date === set.date) current.summaries.push(set.summary);
    else groups.push({ date: set.date, summaries: [set.summary] });
  }
  return groups;
}

/** The most recent sets logged against an exercise, fetched from the same resource route the "Today" logging form's history popover uses. */
function ExerciseHistoryDialog({
  exerciseId,
  exerciseName,
  open,
  onOpenChange,
}: {
  exerciseId: string;
  exerciseName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const fetcher = useFetcher<{ sets: RecentSetView[] }>();

  useEffect(() => {
    if (open && fetcher.state === 'idle' && !fetcher.data) {
      fetcher.load(`/exercises/${exerciseId}/history`);
    }
    // fetcher itself is deliberately not a dependency - it gets a new
    // identity every render, and its own guards keep this idempotent.
  }, [open, exerciseId]);

  const groups = fetcher.data ? groupSetsByDate(fetcher.data.sets) : [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{exerciseName}: recent sets</DialogTitle>
        </DialogHeader>
        {fetcher.state !== 'idle' ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : groups.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {groups.map((group) => (
              <li key={group.date} className="text-sm">
                <span className="font-medium">{formatFullDate(group.date)}</span>
                <span className="text-muted-foreground tabular-nums"> · {group.summaries.join(', ')}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">Nothing logged for this exercise yet.</p>
        )}
      </DialogContent>
    </Dialog>
  );
}

export { ExerciseHistoryDialog };
