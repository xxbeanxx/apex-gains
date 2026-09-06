import type * as React from 'react';
import type { ReactNode } from 'react';

import { Link } from 'react-router';

import { CheckIcon } from 'lucide-react';

import { Badge } from '~/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';
import { cn } from '~/lib/utils';
import type { WeekHistoryDay, WeekPlanDay } from '~application/use-cases/training-plan-service';
import { formatFullDate, formatMonthDay, formatWeekday } from '~shared/format';

/** One day in a week rail. Shared by the upcoming plan and the past summary. */
function DayCell({
  date,
  isToday = false,
  label,
  to,
  children,
}: {
  date: string;
  isToday?: boolean;
  /** Full sentence for screen readers, e.g. "Tuesday 2 September, Push Day". */
  label: string;
  /** When set, the whole cell links here (e.g. to log that day). */
  to?: string;
  children: ReactNode;
}) {
  const cellClassName = cn(
    'relative flex min-w-18 flex-1 flex-col items-center gap-1 rounded-xl border px-2 py-2.5 text-center transition-colors duration-(--dur)',
    isToday ? 'border-brand/40 bg-brand-muted' : 'border-border bg-card/50',
    to ? 'outline-none hover:border-brand/40 hover:bg-brand-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50' : null,
  );

  const content = (
    <>
      {isToday ? <span aria-hidden="true" className="absolute inset-x-3 top-0 h-0.5 rounded-full bg-brand-strong" /> : null}
      <span aria-hidden="true" className={cn('text-xs font-medium', isToday ? 'text-brand-strong' : 'text-muted-foreground')}>
        {formatWeekday(date)}
      </span>
      <span aria-hidden="true" className="text-[0.625rem] text-muted-foreground tabular-nums">
        {formatMonthDay(date)}
      </span>
      <div aria-hidden="true" className="mt-0.5 w-full">
        {children}
      </div>
    </>
  );

  if (to) {
    return (
      <li className="flex min-w-18 flex-1">
        <Link to={to} aria-label={label} className={cellClassName}>
          {content}
        </Link>
      </li>
    );
  }

  return (
    <li aria-label={label} className={cellClassName}>
      {content}
    </li>
  );
}

function WeekRail({ children }: { children: ReactNode }) {
  return <ul className="scrollbar-none -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">{children}</ul>;
}

function UpcomingWeekCard({ days }: { days: WeekPlanDay[] }) {
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
        <WeekRail>
          {days.map((day, index) => {
            const what = day.type === 'workout' ? day.workoutName : day.type === 'rest' ? 'Rest day' : 'Nothing scheduled';
            return (
              <DayCell
                key={day.date}
                date={day.date}
                isToday={index === 0}
                label={`${index === 0 ? 'Today, ' : ''}${formatFullDate(day.date)}: ${what}`}
              >
                {day.type === 'rest' ? (
                  <Badge variant="secondary" className="text-[0.625rem]">
                    Rest
                  </Badge>
                ) : day.type === 'workout' ? (
                  <span className="block w-full truncate text-xs font-medium" title={day.workoutName}>
                    {day.workoutName}
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground">—</span>
                )}
              </DayCell>
            );
          })}
        </WeekRail>
      </CardContent>
    </Card>
  );
}

function PastWeekCard({ days }: { days: WeekHistoryDay[] }) {
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
        <WeekRail>
          {days.map((day) => {
            const what =
              day.status === 'workout'
                ? `${day.setCount} set${day.setCount === 1 ? '' : 's'} logged`
                : day.status === 'rest'
                  ? 'Rest day'
                  : 'Nothing logged';
            return (
              <DayCell
                key={day.date}
                date={day.date}
                to={`/today?date=${day.date}`}
                label={`${formatFullDate(day.date)}: ${what}. Log a set for this day.`}
              >
                {day.status === 'workout' ? (
                  <span className="inline-flex items-center gap-1 text-xs font-semibold tabular-nums">
                    <CheckIcon className="size-3 text-success" />
                    {day.setCount}
                  </span>
                ) : day.status === 'rest' ? (
                  <Badge variant="secondary" className="text-[0.625rem]">
                    Rest
                  </Badge>
                ) : (
                  <span className="text-xs text-muted-foreground">—</span>
                )}
              </DayCell>
            );
          })}
        </WeekRail>
      </CardContent>
    </Card>
  );
}

export { UpcomingWeekCard, PastWeekCard };
