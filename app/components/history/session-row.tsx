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
function SessionRow({ session }: { session: TimelineDay }) {
  const isRest = session.isRestDay && session.sets.length === 0;
  const label = session.workoutName ?? (isRest ? 'Rest day' : 'Logged');

  return (
    <li>
      <Link
        to={`/today?date=${session.date}`}
        aria-label={`${formatFullDate(session.date)}: ${label}, ${session.sets.length} set${session.sets.length === 1 ? '' : 's'}${session.tonnage ? `, ${session.tonnage} lifted` : ''}. Edit this day.`}
        className="flex min-h-10 items-center gap-3 rounded-lg border border-border bg-card/50 px-3 py-2 text-sm outline-none transition-colors duration-(--dur) hover:border-brand/40 hover:bg-brand-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <span aria-hidden="true" className="w-16 shrink-0 text-muted-foreground tabular-nums">
          {formatMonthDay(session.date)}
        </span>
        <span aria-hidden="true" className="flex min-w-0 flex-1 items-center gap-1.5 truncate font-medium">
          {isRest ? <MoonIcon className="size-3.5 shrink-0 text-muted-foreground" /> : null}
          {label}
        </span>
        <span aria-hidden="true" className="w-16 shrink-0 text-right text-muted-foreground tabular-nums">
          {session.sets.length} set{session.sets.length === 1 ? '' : 's'}
        </span>
        <span aria-hidden="true" className="w-20 shrink-0 text-right text-muted-foreground tabular-nums">
          {session.tonnage ?? '—'}
        </span>
      </Link>
    </li>
  );
}

export { SessionRow };
