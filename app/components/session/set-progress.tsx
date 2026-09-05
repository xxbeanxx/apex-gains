import { CheckIcon } from 'lucide-react';

import { cn } from '~/lib/utils';

/** "2 of 3 sets" beside a bar, plus a check once `done >= target`. */
function SetProgress({ done, target }: { done: number; target: number }) {
  const pct = Math.min(100, Math.round((done / target) * 100));
  const complete = done >= target;

  return (
    <div className="flex items-center gap-2.5">
      <span className={cn('shrink-0 text-xs font-medium tabular-nums', complete ? 'text-success' : 'text-muted-foreground')}>
        {done} of {target} sets
      </span>
      <div
        role="progressbar"
        aria-valuenow={done}
        aria-valuemin={0}
        aria-valuemax={target}
        aria-label={`${done} of ${target} sets logged`}
        className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"
      >
        <div
          className={cn(
            'h-full rounded-full transition-[width] duration-(--dur-slow) ease-(--ease-quint)',
            complete ? 'bg-success' : 'bg-brand-strong',
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
      {complete ? (
        <span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-success">
          <CheckIcon className="size-3.5" aria-hidden="true" />
          <span className="sr-only">Done</span>
        </span>
      ) : null}
    </div>
  );
}

export { SetProgress };
