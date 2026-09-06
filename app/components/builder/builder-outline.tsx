import type { ReactNode } from 'react';
import type * as React from 'react';

import { cn } from '~/lib/utils';

/**
 * The right column: a compact, read-only echo of the canvas's order.
 *
 * Deliberately `role="list"` on a `<div>` rather than an `<ol>`: the e2e
 * suite's `orderedRows()` helper matches any `ol > li` on the page to find
 * the canvas's own rows, and this pane renders alongside the canvas at the
 * same viewport widths, so a literal `<ol>` here would double every match.
 */
function BuilderOutline({ children }: { children: ReactNode }) {
  return (
    <div
      role="list"
      className="flex flex-col gap-1 rounded-xl border border-border bg-card p-2 shadow-sm shadow-black/[0.03] dark:shadow-black/20"
    >
      {children}
    </div>
  );
}

/**
 * One outline entry. `active` marks the one row worth calling out - the
 * plan builder's next slot to come up - and is otherwise omitted.
 */
function BuilderOutlineItem({
  position,
  label,
  sublabel,
  active,
}: {
  position: number;
  label: ReactNode;
  sublabel?: ReactNode;
  active?: boolean;
}) {
  return (
    <div role="listitem" className={cn('flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm', active && 'bg-brand-muted')}>
      <span
        aria-hidden="true"
        className={cn(
          'flex size-5 shrink-0 items-center justify-center rounded-md text-[0.6875rem] font-semibold tabular-nums',
          active ? 'bg-brand-strong text-background' : 'bg-muted text-muted-foreground',
        )}
      >
        {position}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate">{label}</p>
        {sublabel ? <p className="truncate text-xs text-muted-foreground">{sublabel}</p> : null}
      </div>
      {active ? <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-brand-strong" /> : null}
    </div>
  );
}

export { BuilderOutline, BuilderOutlineItem };
