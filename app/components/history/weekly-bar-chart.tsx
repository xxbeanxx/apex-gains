import { Bar, BarChart, CartesianGrid, LabelList, XAxis, YAxis } from 'recharts';

import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from '~/components/ui/chart';
import type { WeeklyPointView } from '~application/use-cases/progress-view';

export function WeeklyBarChart({
  points,
  seriesLabel,
  formatValue,
  formatCompact,
  ariaLabel,
}: {
  points: WeeklyPointView[];
  /** Names the series in the tooltip, e.g. "Sets" or "Tonnage". */
  seriesLabel: string;
  /** Formats a value with its unit, for the tooltip, e.g. "12 sets" or "4,250 lb". */
  formatValue: (value: number) => string;
  /** Short and unitless - the y axis ticks and the current week's direct label, e.g. "12" or "4,250". */
  formatCompact: (value: number) => string;
  ariaLabel: string;
}) {
  const config = {
    value: { label: seriesLabel, color: 'var(--brand-strong)' },
  } satisfies ChartConfig;

  return (
    <ChartContainer config={config} className="aspect-auto h-[220px] w-full">
      <BarChart data={points} margin={{ top: 20, right: 4, left: 0, bottom: 0 }} role="img" aria-label={ariaLabel}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} minTickGap={24} interval="preserveStartEnd" />
        <YAxis
          tickLine={false}
          axisLine={false}
          tickMargin={4}
          width="auto"
          allowDecimals={false}
          tickFormatter={formatCompact}
        />
        <ChartTooltip
          cursor={{ fill: 'var(--muted)', fillOpacity: 0.5 }}
          content={
            <ChartTooltipContent
              labelFormatter={(label) => `Week of ${label}`}
              formatter={(value) => (
                <div className="flex flex-1 items-center justify-between gap-4 leading-none">
                  <span className="text-muted-foreground">{seriesLabel}</span>
                  <span className="font-medium text-foreground tabular-nums">{formatValue(Number(value))}</span>
                </div>
              )}
            />
          }
        />
        <Bar
          dataKey="value"
          fill="var(--color-value)"
          radius={[4, 4, 0, 0]}
          maxBarSize={24}
          activeBar={{ fill: 'var(--brand)' }}
          isAnimationActive={false}
        >
          {
            // Only the current week is direct-labelled: a number over every
            // bar collides once the range is more than a couple of months.
            //
            // The week comes off the entry's own payload rather than from
            // `points[index]`: a zero-value week draws no rectangle, and the
            // index a label list reports counts the rectangles that exist.
          }
          <LabelList
            position="top"
            offset={8}
            className="fill-foreground text-[11px] font-semibold tabular-nums"
            valueAccessor={(entry) => {
              const point = entry.payload as WeeklyPointView;
              return point.isCurrentWeek && point.value > 0 ? formatCompact(point.value) : '';
            }}
          />
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}
