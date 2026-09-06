import { XIcon } from 'lucide-react';
import { useFetcher } from 'react-router';

import type { Intent } from '~/lib/intent';
import type { LoggedSetView } from '~/services/session-service.server';

/** One set's own remove form, so its fetcher hides only this row while its own delete is in flight. */
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
      className="flex items-center gap-2.5 rounded-lg bg-muted/60 py-1.5 pr-1.5 pl-2.5 text-sm"
      hidden={fetcher.state !== 'idle'}
    >
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
      <fetcher.Form method="post" className="contents">
        <input {...removeSet.field} />
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
      </fetcher.Form>
    </li>
  );
}

function LoggedSetsList({ sets, date, removeSet }: { sets: LoggedSetView[]; date: string; removeSet: Intent<object> }) {
  if (sets.length === 0) return null;
  return (
    <ol className="flex flex-col gap-1.5">
      {sets.map((set, index) => (
        <LoggedSetRow key={set.id} set={set} index={index} date={date} removeSet={removeSet} />
      ))}
    </ol>
  );
}

export { LoggedSetsList };
