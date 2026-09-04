import { useMemo, useState } from 'react';

import { DateOnly } from '~/domain/values/date-only';
import { formatMonthDay } from '~/lib/format';
import type { ProgressSeriesView } from '~/services/progress-view';

import { ChartTooltip } from './chart-tooltip';
import { formatMetricValue, useChartWidth } from './chart-utils';

const HEIGHT = 220;
const MARGIN = { top: 20, right: 54, bottom: 22, left: 36 };

export function ExerciseProgressChart({ series }: { series: ProgressSeriesView }) {
  const [ref, width] = useChartWidth<HTMLDivElement>();
  const [hovered, setHovered] = useState<number | null>(null);

  const chartW = Math.max(0, width - MARGIN.left - MARGIN.right);
  const chartH = HEIGHT - MARGIN.top - MARGIN.bottom;

  const { points } = series;
  const firstDate = points[0].date;
  const lastDate = points[points.length - 1].date;
  const first = DateOnly.parse(firstDate);
  const totalDays = Math.max(1, first.daysUntil(DateOnly.parse(lastDate)));

  const values = points.map((p) => p.value);
  const dataMin = Math.min(...values);
  const dataMax = Math.max(...values);
  const range = dataMax - dataMin;
  const pad = range > 0 ? range * 0.15 : Math.max(dataMax * 0.1, 1);
  const yMin = Math.max(0, dataMin - pad);
  const yMax = dataMax + pad;

  const xFor = (date: string) => MARGIN.left + (first.daysUntil(DateOnly.parse(date)) / totalDays) * chartW;
  const yFor = (value: number) => MARGIN.top + chartH - ((value - yMin) / (yMax - yMin)) * chartH;

  const plotted = useMemo(
    () => points.map((p) => ({ ...p, x: xFor(p.date), y: yFor(p.value) })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [points, yMin, yMax, chartW, chartH],
  );

  const linePath = plotted.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
  const baselineY = MARGIN.top + chartH;
  const areaPath =
    plotted.length > 0 ? `${linePath} L${plotted[plotted.length - 1].x},${baselineY} L${plotted[0].x},${baselineY} Z` : '';

  const last = plotted[plotted.length - 1];
  const tickValues = [...new Set([yMin, (yMin + yMax) / 2, yMax].map((v) => Math.round(v)))];

  function nearestIndex(clientX: number, rect: DOMRect): number {
    const px = MARGIN.left + (clientX - rect.left);
    let best = 0;
    let bestDist = Infinity;
    plotted.forEach((p, i) => {
      const dist = Math.abs(p.x - px);
      if (dist < bestDist) {
        bestDist = dist;
        best = i;
      }
    });
    return best;
  }

  const hoveredPoint = hovered != null ? plotted[hovered] : null;

  return (
    <div ref={ref} className="relative w-full" style={{ height: HEIGHT }}>
      {width > 0 ? (
        <svg
          viewBox={`0 0 ${width} ${HEIGHT}`}
          className="size-full overflow-visible"
          role="img"
          aria-label={`${series.metricLabel} for ${series.exerciseName}, from ${formatMonthDay(firstDate)} to ${formatMonthDay(lastDate)}: ${formatMetricValue(dataMin, series.unit)} to ${formatMetricValue(dataMax, series.unit)} ${series.unit}`}
        >
          {tickValues.map((t) => (
            <g key={t}>
              <line
                x1={MARGIN.left}
                x2={width - MARGIN.right}
                y1={yFor(t)}
                y2={yFor(t)}
                className="stroke-border"
                strokeWidth={1}
              />
              <text
                x={MARGIN.left - 6}
                y={yFor(t)}
                textAnchor="end"
                dominantBaseline="middle"
                className="fill-muted-foreground text-[10px] tabular-nums"
              >
                {t}
              </text>
            </g>
          ))}

          <path d={areaPath} className="fill-brand" fillOpacity={0.1} stroke="none" />
          <path
            d={linePath}
            fill="none"
            className="stroke-brand-strong"
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />

          {hoveredPoint ? (
            <line
              x1={hoveredPoint.x}
              x2={hoveredPoint.x}
              y1={MARGIN.top}
              y2={baselineY}
              className="stroke-muted-foreground/40"
              strokeWidth={1}
            />
          ) : null}

          {
            // End marker: ring in the surface color, then the mark itself.
          }
          <circle cx={last.x} cy={last.y} r={7} className="fill-card" />
          <circle cx={last.x} cy={last.y} r={4} className="fill-brand-strong" />
          <text
            x={last.x + 10}
            y={last.y}
            dominantBaseline="middle"
            className="fill-foreground text-[11px] font-medium tabular-nums"
          >
            {formatMetricValue(last.value, series.unit)} {series.unit}
          </text>

          {hoveredPoint ? (
            <>
              <circle cx={hoveredPoint.x} cy={hoveredPoint.y} r={6} className="fill-card" />
              <circle cx={hoveredPoint.x} cy={hoveredPoint.y} r={3.5} className="fill-brand-strong" />
            </>
          ) : null}

          <text
            x={MARGIN.left}
            y={HEIGHT - MARGIN.bottom + 14}
            textAnchor="start"
            className="fill-muted-foreground text-[10px]"
          >
            {formatMonthDay(firstDate)}
          </text>
          <text
            x={width - MARGIN.right}
            y={HEIGHT - MARGIN.bottom + 14}
            textAnchor="end"
            className="fill-muted-foreground text-[10px]"
          >
            {formatMonthDay(lastDate)}
          </text>

          <rect
            x={MARGIN.left}
            y={MARGIN.top}
            width={chartW}
            height={chartH}
            fill="transparent"
            onPointerMove={(e) => setHovered(nearestIndex(e.clientX, e.currentTarget.getBoundingClientRect()))}
            onPointerLeave={() => setHovered(null)}
          />
        </svg>
      ) : null}

      <ChartTooltip
        x={hoveredPoint && width > 0 ? (hoveredPoint.x / width) * 100 : 0}
        y={hoveredPoint ? (hoveredPoint.y / HEIGHT) * 100 : 0}
        visible={hoveredPoint != null}
      >
        {hoveredPoint ? (
          <>
            <div className="font-semibold tabular-nums">
              {formatMetricValue(hoveredPoint.value, series.unit)} {series.unit}
            </div>
            <div className="text-muted-foreground">{formatMonthDay(hoveredPoint.date)}</div>
          </>
        ) : null}
      </ChartTooltip>
    </div>
  );
}
