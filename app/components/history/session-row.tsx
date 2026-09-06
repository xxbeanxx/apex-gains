import { MoonIcon } from 'lucide-react';
import { Link } from 'react-router';

import { formatFullDate, formatMonthDay } from '~shared/format';
import type { TimelineDay } from '~application/use-cases/progress-service';

/**
 * One dense row for a logged day - date, workout name, set count, tonnage -
 * linking to `/today?date=...` for the per-set detail it doesn't carry
 * itself. Shared by the history timeline and the dashboard's recent-sessions
 * list, so the two stay the same shape rather than drifting apart.
 */
function SessionRow({ session }: { session: TimelineDay }) {
  const isRest = session.isRestDay && session.sets.length === 0;
  const label = session.workoutName ?? (isRest ? 'Rest day' : 'Logged');

  return (
    <li>
      <Link
        to={`/today?date=${session.date}`}
        aria-label={`${formatFullDate(session.date)}: ${label}, ${session.sets.length} set${session.sets.length === 1 ? '' : 's'}${session.tonnage ? `, ${session.tonnage} lifted` : ''}. Edit this day.`}
        className="flex items-center gap-3 rounded-lg px-2 py-2.5 text-sm transition-colors duration-(--dur-fast) hover:bg-muted"
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
