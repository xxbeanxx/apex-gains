'use client';

import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react';
import * as React from 'react';

import { Button } from '~/components/ui/button';
import { cn } from '~/lib/utils';

function toDateString(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseDateString(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
}

const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

/**
 * A single-month date grid over plain `YYYY-MM-DD` strings (local calendar
 * days, no time-of-day) - matches how dates are stored and compared
 * throughout this app. Not a general-purpose date-range picker.
 */
function Calendar({
  selected,
  today,
  maxDate,
  onSelect,
  className,
}: {
  selected: string;
  today: string;
  /** Dates after this (string-compared, so also `YYYY-MM-DD`) are shown disabled. */
  maxDate?: string;
  onSelect: (dateStr: string) => void;
  className?: string;
}) {
  const selectedDate = parseDateString(selected);
  const [viewYear, setViewYear] = React.useState(selectedDate.getFullYear());
  const [viewMonth, setViewMonth] = React.useState(selectedDate.getMonth());

  const monthLabel = new Date(viewYear, viewMonth, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const firstOfMonth = new Date(viewYear, viewMonth, 1);
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

  const cells: Array<Date | null> = [
    ...Array.from({ length: firstOfMonth.getDay() }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => new Date(viewYear, viewMonth, i + 1)),
  ];

  function goToPreviousMonth() {
    const d = new Date(viewYear, viewMonth - 1, 1);
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth());
  }

  function goToNextMonth() {
    const d = new Date(viewYear, viewMonth + 1, 1);
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth());
  }

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <div className="flex items-center justify-between">
        <Button type="button" variant="ghost" size="icon-sm" onClick={goToPreviousMonth} aria-label="Previous month">
          <ChevronLeftIcon aria-hidden="true" />
        </Button>
        <span className="text-sm font-medium" aria-live="polite">
          {monthLabel}
        </span>
        <Button type="button" variant="ghost" size="icon-sm" onClick={goToNextMonth} aria-label="Next month">
          <ChevronRightIcon aria-hidden="true" />
        </Button>
      </div>

      <div aria-hidden="true" className="grid grid-cols-7 gap-y-1 text-center text-xs text-muted-foreground">
        {WEEKDAY_LABELS.map((label, i) => (
          <span key={i}>{label}</span>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-y-1">
        {cells.map((date, i) => {
          if (!date) return <span key={`blank-${i}`} />;

          const dateStr = toDateString(date);
          const isDisabled = maxDate ? dateStr > maxDate : false;
          const isSelected = dateStr === selected;
          const isToday = dateStr === today;

          return (
            <button
              key={dateStr}
              type="button"
              disabled={isDisabled}
              onClick={() => onSelect(dateStr)}
              aria-current={isToday ? 'date' : undefined}
              aria-pressed={isSelected}
              className={cn(
                'mx-auto flex size-8 items-center justify-center rounded-md text-sm tabular-nums transition-colors duration-(--dur-fast) disabled:pointer-events-none disabled:opacity-30',
                isSelected
                  ? 'bg-brand font-semibold text-brand-foreground'
                  : isToday
                    ? 'bg-brand-muted font-medium text-brand-strong'
                    : 'hover:bg-muted',
              )}
            >
              {date.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export { Calendar };
