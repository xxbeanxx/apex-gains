import { CheckIcon } from 'lucide-react';
import { Link } from 'react-router';
import type { WeekHistoryDay, WeekPlanDay } from '~application/use-cases/training-plan-service';
import { formatFullDate, formatMonthDay, formatWeekday } from '~shared/format';

import { Badge } from '~/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';
import { cn } from '~/lib/utils';

/**
 * The coming week as one row per day, so a workout name gets the card's full
 * width and wraps rather than being cut off - it is the one thing this card is
 * for.
 */
export function UpcomingWeekCard({ days }: { days: WeekPlanDay[] }) {
  const planned = days.filter((d) => d.type === 'workout').length;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Next seven days</CardTitle>
        <p className="text-sm text-muted-foreground">
          {planned} workout{planned === 1 ? '' : 's'} scheduled
        </p>
      </CardHeader>
      <CardContent>
        <ul className="flex flex-col gap-1.5">
          {days.map((day, index) => {
            const isToday = index === 0;
            const what = day.type === 'workout' ? day.workoutName : day.type === 'rest' ? 'Rest day' : 'Nothing scheduled';
            return (
              <li
                key={day.date}
                aria-label={`${isToday ? 'Today, ' : ''}${formatFullDate(day.date)}: ${what}`}
                className={cn(
                  'relative flex min-h-10 items-center gap-3 rounded-lg border px-3 py-2',
                  isToday ? 'border-brand/40 bg-brand-muted' : 'border-border bg-card/50',
                )}
              >
                {isToday ? (
                  <span aria-hidden="true" className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-brand-strong" />
                ) : null}
                <span aria-hidden="true" className="w-24 shrink-0 whitespace-nowrap">
                  <span className={cn('font-medium', isToday ? 'text-brand-strong' : 'text-foreground')}>
                    {formatWeekday(day.date)}
                  </span>{' '}
                  <span className="text-xs text-muted-foreground tabular-nums">{formatMonthDay(day.date)}</span>
                </span>
                <span aria-hidden="true" className="min-w-0 flex-1 wrap-break-word">
                  {day.type === 'rest' ? (
                    <Badge variant="secondary">Rest</Badge>
                  ) : day.type === 'workout' ? (
                    <span className="font-medium">{day.workoutName}</span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}

/**
 * The past week in the same row shape as `UpcomingWeekCard`, so the two cards
 * read as one pattern - each row links to that day on `/today` for the
 * per-set detail it doesn't carry itself.
 */
export function PastWeekCard({ days }: { days: WeekHistoryDay[] }) {
  const workouts = days.filter((d) => d.status === 'workout').length;
  const rests = days.filter((d) => d.status === 'rest').length;
  const totalSets = days.reduce((sum, d) => sum + d.setCount, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Last seven days</CardTitle>
        <p className="text-sm text-muted-foreground">
          {workouts} workout{workouts === 1 ? '' : 's'}, {rests} rest day
          {rests === 1 ? '' : 's'}, {totalSets} set{totalSets === 1 ? '' : 's'} logged
        </p>
      </CardHeader>
      <CardContent>
        <ul className="flex flex-col gap-1.5">
          {days.map((day) => {
            const what =
              day.status === 'workout'
                ? `${day.setCount} set${day.setCount === 1 ? '' : 's'} logged`
                : day.status === 'rest'
                  ? 'Rest day'
                  : 'Nothing logged';
            return (
              <li key={day.date}>
                <Link
                  to={`/today?date=${day.date}`}
                  aria-label={`${formatFullDate(day.date)}: ${what}. Log a set for this day.`}
                  className="flex min-h-10 items-center gap-3 rounded-lg border border-border bg-card/50 px-3 py-2 outline-none transition-colors duration-(--dur) hover:border-brand/40 hover:bg-brand-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  <span aria-hidden="true" className="w-24 shrink-0 whitespace-nowrap">
                    <span className="font-medium text-foreground">{formatWeekday(day.date)}</span>{' '}
                    <span className="text-xs text-muted-foreground tabular-nums">{formatMonthDay(day.date)}</span>
                  </span>
                  <span aria-hidden="true" className="min-w-0 flex-1 wrap-break-word">
                    {day.status === 'workout' ? (
                      <span className="inline-flex items-center gap-1.5 font-medium tabular-nums">
                        <CheckIcon className="size-3.5 shrink-0 text-success" />
                        {day.setCount} set{day.setCount === 1 ? '' : 's'}
                      </span>
                    ) : day.status === 'rest' ? (
                      <Badge variant="secondary">Rest</Badge>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
