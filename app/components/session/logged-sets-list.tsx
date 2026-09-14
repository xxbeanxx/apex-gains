import { XIcon } from 'lucide-react';
import { useFetcher } from 'react-router';
import type { LoggedSetView } from '~application/use-cases/session-service';

import type { Intent } from '~/lib/intent';

/**
 * One set's own remove form, so its fetcher hides only this row while its own delete is in flight.
 */
function LoggedSetRow({
  set,
  index,
  date,
  removeSet,
}: {
  set: LoggedSetView;
  index: number;
  date: string;
  removeSet: Intent<object>;
}) {
  const fetcher = useFetcher();

  return (
    <li
      className="bg-muted/60 flex items-center gap-2.5 rounded-lg py-1.5 pr-1.5 pl-2.5 text-sm"
      hidden={fetcher.state !== 'idle'}
    >
      <span
        aria-hidden="true"
        className="bg-brand-muted text-brand-strong flex size-5 shrink-0 items-center justify-center rounded-md text-[0.6875rem] font-semibold tabular-nums"
      >
        {index + 1}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate tabular-nums">
          <span className="sr-only">Set {index + 1}: </span>
          {set.summary}
        </span>
        {set.notes ? <span className="text-muted-foreground block truncate text-xs">{set.notes}</span> : null}
      </span>
      <fetcher.Form method="post" className="contents">
        <input {...removeSet.field} />
        <input type="hidden" name="date" value={date} />
        <input type="hidden" name="setId" value={set.id} />
        <button
          type="submit"
          className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive flex size-6 shrink-0 items-center justify-center rounded-md transition-colors duration-(--dur-fast) pointer-coarse:size-8"
        >
          <XIcon className="size-3.5" aria-hidden="true" />
          <span className="sr-only">
            Remove set {index + 1}, {set.summary}
          </span>
        </button>
      </fetcher.Form>
    </li>
  );
}

export function LoggedSetsList({ sets, date, removeSet }: { sets: LoggedSetView[]; date: string; removeSet: Intent<object> }) {
  if (sets.length === 0) {
    return null;
  }

  return (
    <ol className="flex flex-col gap-1.5">
      {sets.map((set, index) => (
        <LoggedSetRow key={set.id} set={set} index={index} date={date} removeSet={removeSet} />
      ))}
    </ol>
  );
}
