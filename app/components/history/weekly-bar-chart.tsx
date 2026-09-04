import { useState } from 'react';

import { cn } from '~/lib/utils';
import type { WeeklyPointView } from '~/services/progress-view';

import { ChartTooltip } from './chart-tooltip';
import { axisTicks, niceAxisStep, roundedTopBarPath, useChartWidth } from './chart-utils';

const HEIGHT = 220;
const MARGIN = { top: 28, right: 8, bottom: 24, left: 30 };

export function WeeklyBarChart({
  points,
  formatValue,
  formatCompact,
  ariaLabel,
}: {
  points: WeeklyPointView[];
  /** Formats a value for the tooltip, e.g. "12 sets" or "4,250 lb". */
  formatValue: (value: number) => string;
  /** Formats a value for the label printed above each bar - short, no unit, e.g. "12" or "4,250". */
  formatCompact: (value: number) => string;
  ariaLabel: string;
}) {
  const [ref, width] = useChartWidth<HTMLDivElement>();
  const [hovered, setHovered] = useState<number | null>(null);

  const chartW = Math.max(0, width - MARGIN.left - MARGIN.right);
  const chartH = HEIGHT - MARGIN.top - MARGIN.bottom;

  const maxValue = Math.max(0, ...points.map((p) => p.value));
  const step = niceAxisStep(maxValue);
  const axisMax = maxValue > 0 ? Math.ceil(maxValue / step) * step : step * 4;
  const ticks = axisTicks(axisMax, step);

  const bandWidth = chartW / points.length;
  const barWidth = Math.min(24, bandWidth * 0.55);
  const lastIndex = points.length - 1;
  // Every bar's value is shown when there's room for it; past a point, thin
  // to every other bar (in step with the week labels below) rather than
  // let the numbers collide.
  const showEveryLabel = bandWidth >= 40;

  const yFor = (value: number) => MARGIN.top + chartH - (value / axisMax) * chartH;

  const hoveredPoint = hovered != null ? points[hovered] : null;
  const tooltipX = hovered != null && width > 0 ? ((MARGIN.left + (hovered + 0.5) * bandWidth) / width) * 100 : 0;
  const tooltipY = hoveredPoint ? (yFor(hoveredPoint.value) / HEIGHT) * 100 : 0;

  return (
    <div ref={ref} className="relative w-full" style={{ height: HEIGHT }}>
      {width > 0 ? (
        <svg viewBox={`0 0 ${width} ${HEIGHT}`} className="size-full overflow-visible" role="img" aria-label={ariaLabel}>
          {ticks.map((t) => (
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

          {points.map((point, i) => {
            const x = MARGIN.left + i * bandWidth + (bandWidth - barWidth) / 2;
            const height = (point.value / axisMax) * chartH;
            const y = MARGIN.top + chartH - height;
            const showDateLabel = points.length <= 8 || (lastIndex - i) % 2 === 0;
            const showValueLabel = point.value > 0 && (showEveryLabel || showDateLabel);

            return (
              <g key={point.weekStart}>
                {/* Full-column hit target, taller than the bar itself. */}
                <rect
                  x={MARGIN.left + i * bandWidth}
                  y={MARGIN.top}
                  width={bandWidth}
                  height={chartH}
                  fill="transparent"
                  onPointerEnter={() => setHovered(i)}
                  onPointerLeave={() => setHovered((h) => (h === i ? null : h))}
                  onFocus={() => setHovered(i)}
                  onBlur={() => setHovered((h) => (h === i ? null : h))}
                  tabIndex={0}
                  role="img"
                  aria-label={`Week of ${point.label}: ${formatValue(point.value)}`}
                />
                {point.value > 0 ? (
                  <path
                    d={roundedTopBarPath(x, y, barWidth, height, 4)}
                    className={cn(
                      'pointer-events-none transition-[fill] duration-(--dur-fast)',
                      hovered === i ? 'fill-brand' : 'fill-brand-strong',
                    )}
                  />
                ) : null}
                {showValueLabel ? (
                  <text
                    x={x + barWidth / 2}
                    y={y - 6}
                    textAnchor="middle"
                    className={cn(
                      'tabular-nums',
                      point.isCurrentWeek ? 'fill-foreground text-[11px] font-semibold' : 'fill-muted-foreground text-[10px]',
                    )}
                  >
                    {formatCompact(point.value)}
                  </text>
                ) : null}
                {showDateLabel ? (
                  <text
                    x={x + barWidth / 2}
                    y={HEIGHT - MARGIN.bottom + 14}
                    textAnchor="middle"
                    className={cn('text-[10px]', point.isCurrentWeek ? 'fill-foreground font-medium' : 'fill-muted-foreground')}
                  >
                    {point.label}
                  </text>
                ) : null}
              </g>
            );
          })}
        </svg>
      ) : null}

      <ChartTooltip x={tooltipX} y={tooltipY} visible={hoveredPoint != null}>
        {hoveredPoint ? (
          <>
            <div className="font-semibold tabular-nums">{formatValue(hoveredPoint.value)}</div>
            <div className="text-muted-foreground">Week of {hoveredPoint.label}</div>
          </>
        ) : null}
      </ChartTooltip>
    </div>
  );
}
