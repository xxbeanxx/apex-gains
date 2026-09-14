import type { ComponentProps, ReactNode } from 'react';
import { cn } from '~web/lib/utils';

/**
 * One headline number. Several of these in a row are how a dashboard leads:
 * a handful of totals is a KPI row, not a bar chart of one bar each.
 *
 * The value carries the font's proportional figures on purpose - `tabular-nums`
 * gives every digit the width of a zero, which reads loose at this size. That
 * is for columns of numbers that have to line up vertically, like the user
 * table.
 */
export function Stat({
  label,
  value,
  hint,
  className,
  ...props
}: Omit<ComponentProps<'div'>, 'children'> & {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
}) {
  return (
    <div
      data-slot="stat"
      className={cn('flex flex-col gap-1 rounded-xl border border-border bg-card px-4 py-3.5', className)}
      {...props}
    >
      <span className="text-muted-foreground text-xs font-medium">{label}</span>
      <span className="font-heading text-2xl font-semibold tracking-tight">{value}</span>
      {hint ? <span className="text-muted-foreground text-xs">{hint}</span> : null}
    </div>
  );
}
