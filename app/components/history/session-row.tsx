import { MoonIcon } from 'lucide-react';
import { Link } from 'react-router';
import type { TimelineDay } from '~application/use-cases/progress-service';
import { formatFullDate, formatMonthDay } from '~shared/format';

/**
 * One row for a logged day - date, workout name, set count, tonnage - in the
 * same bordered-row shape as the week-overview cards, linking to
 * `/today?date=...` for the per-set detail it doesn't carry itself. Shared by
 * the history timeline and the dashboard's recent-sessions list, so the two
 * stay the same shape rather than drifting apart.
 */
export function SessionRow({ session }: { session: TimelineDay }) {
  const isRest = session.isRestDay && session.sets.length === 0;
  const label = session.workoutName ?? (isRest ? 'Rest day' : 'Logged');

  return (
    <li>
      <Link
        to={`/today?date=${session.date}`}
        aria-label={`${formatFullDate(session.date)}: ${label}, ${session.sets.length} set${session.sets.length === 1 ? '' : 's'}${session.tonnage ? `, ${session.tonnage} lifted` : ''}. Edit this day.`}
        className="border-border bg-card/50 hover:border-brand/40 hover:bg-brand-muted/60 focus-visible:ring-ring/50 flex min-h-10 items-center gap-3 rounded-lg border px-3 py-2 text-sm transition-colors duration-(--dur) outline-none focus-visible:ring-3"
      >
        <span aria-hidden="true" className="text-muted-foreground w-16 shrink-0 tabular-nums">
          {formatMonthDay(session.date)}
        </span>
        <span aria-hidden="true" className="flex min-w-0 flex-1 items-center gap-1.5 truncate font-medium">
          {isRest ? <MoonIcon className="text-muted-foreground size-3.5 shrink-0" /> : null}
          {label}
        </span>
        <span aria-hidden="true" className="text-muted-foreground w-16 shrink-0 text-right tabular-nums">
          {session.sets.length} set{session.sets.length === 1 ? '' : 's'}
        </span>
        <span aria-hidden="true" className="text-muted-foreground w-20 shrink-0 text-right tabular-nums">
          {session.tonnage ?? '—'}
        </span>
      </Link>
    </li>
  );
}
