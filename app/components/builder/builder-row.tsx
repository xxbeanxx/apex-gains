import type { ReactNode } from 'react';
import type * as React from 'react';

/**
 * One canvas row: a position badge, a title, an optional chip summary, the
 * page's own up/down controls and `⋯` menu, and an optional edit
 * disclosure.
 *
 * `detail` is a plain `<details>` element the page builds itself - see
 * `/workouts/:workoutId`'s expand-to-edit row - rather than something this
 * component controls, so there is no client state standing between a click
 * and the disclosure opening. A page with nothing to edit on a row (the
 * plan builder's day slots) omits it.
 */
function BuilderRow({
  position,
  title,
  chips,
  note,
  controls,
  menu,
  detail,
}: {
  position: number;
  title: ReactNode;
  chips?: ReactNode;
  /** A line under the chips - the workout builder's progression suggestion is the one caller. */
  note?: ReactNode;
  controls?: ReactNode;
  menu?: ReactNode;
  detail?: ReactNode;
}) {
  return (
    <li className="rounded-xl border border-border bg-card shadow-sm shadow-black/[0.03] dark:shadow-black/20">
      <div className="flex items-center gap-3 px-3 py-2.5">
        <span
          aria-hidden="true"
          className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-xs font-semibold text-muted-foreground tabular-nums"
        >
          {position}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-pretty">{title}</p>
          {chips ? <div className="mt-1 flex flex-wrap gap-1">{chips}</div> : null}
          {note ? <div className="mt-1.5">{note}</div> : null}
        </div>
        {controls ? <div className="flex shrink-0 items-center gap-0.5">{controls}</div> : null}
        {menu}
      </div>
      {detail ? <div className="border-t border-border px-3 py-2.5">{detail}</div> : null}
    </li>
  );
}

export { BuilderRow };
