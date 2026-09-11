'use client';

import { type ReactNode, useState } from 'react';

import { CalendarIcon } from 'lucide-react';

import { Button } from '~/components/ui/button';
import { Calendar } from '~/components/ui/calendar';
import { Field } from '~/components/ui/field';
import { Popover, PopoverContent, PopoverTrigger } from '~/components/ui/popover';
import { formatShortDate } from '~shared/format';

/**
 * A `Field`-wrapped date picker over the `Calendar` grid, for a plain form
 * post. The submitted value is a hidden input driven by local state - the
 * visible control is a button, since that's what the calendar popover
 * attaches to - so a parent form reads it the same way it would a native
 * `<input type="date">`. Give it the same `key={value}` a caller would give
 * an uncontrolled `Input` to reset it after the value it was seeded from
 * changes underneath it.
 */
function DateField({
  name,
  label,
  today,
  defaultValue,
  max,
  description,
  error,
  action,
  className,
}: {
  name: string;
  label: ReactNode;
  today: string;
  defaultValue: string;
  max?: string;
  description?: ReactNode;
  error?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  const [value, setValue] = useState(defaultValue);
  const [open, setOpen] = useState(false);

  return (
    <Field label={label} description={description} error={error} action={action} className={className}>
      {({ id, describedBy, invalid }) => (
        <Popover open={open} onOpenChange={setOpen}>
          <input type="hidden" name={name} value={value} />
          <PopoverTrigger asChild>
            <Button
              id={id}
              aria-describedby={describedBy}
              aria-invalid={invalid || undefined}
              type="button"
              variant="outline"
              className="w-full justify-start gap-2 font-normal"
            >
              <CalendarIcon aria-hidden="true" />
              {formatShortDate(value)}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-auto">
            <Calendar
              selected={value}
              today={today}
              maxDate={max}
              onSelect={(dateStr) => {
                setValue(dateStr);
                setOpen(false);
              }}
            />
          </PopoverContent>
        </Popover>
      )}
    </Field>
  );
}

export { DateField };
