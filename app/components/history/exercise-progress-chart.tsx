import { useId } from 'react';

import { Area, AreaChart, CartesianGrid, ReferenceDot, XAxis, YAxis } from 'recharts';

import { formatMetricValue, paddedAxis } from '~/components/history/chart-utils';
import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from '~/components/ui/chart';
import type { ProgressSeriesView } from '~application/use-cases/progress-view';
import { formatMonthDay } from '~shared/format';

/**
 * `YYYY-MM-DD` as a UTC timestamp, so the x axis is a real time scale:
 * sessions are logged at irregular intervals and a plateau between two
 * distant dates should look like one.
 */
function toTimestamp(date: string): number {
  return Date.parse(`${date}T00:00:00Z`);
}

function toDateString(timestamp: number): string {
  return new Date(timestamp).toISOString().slice(0, 10);
}

export function ExerciseProgressChart({ series }: { series: ProgressSeriesView }) {
  // The gradient is referenced by `url(#id)`, which is document-global -
  // two of these on one page would otherwise share whichever def rendered last.
  const gradientId = `progress-fill-${useId().replace(/:/g, '')}`;

  const data = series.points.map((point) => ({ t: toTimestamp(point.date), value: point.value }));
  const last = data[data.length - 1];

  const values = series.points.map((point) => point.value);
  const dataMin = Math.min(...values);
  const dataMax = Math.max(...values);
  const axis = paddedAxis(dataMin, dataMax);

  const config = {
    value: { label: series.metricLabel, color: 'var(--brand-strong)' },
  } satisfies ChartConfig;

  return (
    <ChartContainer config={config} className="aspect-auto h-[220px] w-full">
      <AreaChart
        data={data}
        margin={{ top: 16, right: 64, left: 0, bottom: 0 }}
        role="img"
        aria-label={`${series.metricLabel} for ${series.exerciseName}, from ${formatMonthDay(series.points[0].date)} to ${formatMonthDay(series.points[series.points.length - 1].date)}: ${formatMetricValue(dataMin, series.unit)} to ${formatMetricValue(dataMax, series.unit)} ${series.unit}`}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-value)" stopOpacity={0.25} />
            <stop offset="100%" stopColor="var(--color-value)" stopOpacity={0.02} />
          </linearGradient>
        </defs>

        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="t"
          type="number"
          scale="time"
          domain={['dataMin', 'dataMax']}
          tickFormatter={(value: number) => formatMonthDay(toDateString(value))}
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          minTickGap={40}
        />
        <YAxis
          domain={axis.domain}
          ticks={axis.ticks}
          tickFormatter={(value: number) => formatMetricValue(value, series.unit)}
          tickLine={false}
          axisLine={false}
          tickMargin={4}
          width="auto"
        />
        <ChartTooltip
          cursor={{ stroke: 'var(--muted-foreground)', strokeOpacity: 0.4 }}
          content={
            <ChartTooltipContent
              labelFormatter={(_label, payload) => formatMonthDay(toDateString(Number(payload[0]?.payload?.t)))}
              formatter={(value) => (
                <div className="flex flex-1 items-center justify-between gap-4 leading-none">
                  <span className="text-muted-foreground">{series.metricLabel}</span>
                  <span className="font-medium text-foreground tabular-nums">
                    {formatMetricValue(Number(value), series.unit)} {series.unit}
                  </span>
                </div>
              )}
            />
          }
        />

        <Area
          dataKey="value"
          type="monotone"
          stroke="var(--color-value)"
          strokeWidth={2}
          fill={`url(#${gradientId})`}
          dot={false}
          activeDot={{ r: 4, fill: 'var(--color-value)', stroke: 'var(--card)', strokeWidth: 2 }}
          isAnimationActive={false}
        />

        {
          // The latest value is the one a reader is looking for, so it is
          // direct-labelled past the plot's right edge - the margin above
          // reserves the room.
        }
        <ReferenceDot
          x={last.t}
          y={last.value}
          r={4}
          fill="var(--color-value)"
          stroke="var(--card)"
          strokeWidth={2}
          label={{
            value: `${formatMetricValue(last.value, series.unit)} ${series.unit}`,
            position: 'right',
            offset: 10,
            className: 'fill-foreground text-[11px] font-medium',
          }}
        />
      </AreaChart>
    </ChartContainer>
  );
}
