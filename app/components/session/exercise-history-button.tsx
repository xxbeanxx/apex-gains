import { useState } from 'react';

import { useFetcher } from 'react-router';

import { CircleHelpIcon } from 'lucide-react';

import { Button } from '~/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '~/components/ui/popover';
import type { RecentSetView } from '~application/use-cases/session-service';
import { formatRelativeDate } from '~shared/format';

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

export { ExerciseHistoryButton };
