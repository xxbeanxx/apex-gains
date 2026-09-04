import { useState } from 'react';

import { cn } from '~/lib/utils';
import type { WeeklyPointView } from '~/services/progress-view';

import { ChartTooltip } from './chart-tooltip';
import { axisTicks, niceAxisStep, roundedTopBarPath } from './chart-utils';

const VIEW_W = 600;
const VIEW_H = 220;
const MARGIN = { top: 24, right: 8, bottom: 24, left: 26 };
const CHART_W = VIEW_W - MARGIN.left - MARGIN.right;
const CHART_H = VIEW_H - MARGIN.top - MARGIN.bottom;

export function WeeklyBarChart({
  points,
  formatValue,
  ariaLabel,
}: {
  points: WeeklyPointView[];
  /** Formats a value for the current-week direct label and the tooltip, e.g. "12 sets" or "4,250 lb". */
  formatValue: (value: number) => string;
  ariaLabel: string;
}) {
  const [hovered, setHovered] = useState<number | null>(null);

  const maxValue = Math.max(0, ...points.map((p) => p.value));
  const step = niceAxisStep(maxValue);
  const axisMax = maxValue > 0 ? Math.ceil(maxValue / step) * step : step * 4;
  const ticks = axisTicks(axisMax, step);

  const bandWidth = CHART_W / points.length;
  const barWidth = Math.min(24, bandWidth * 0.55);
  const lastIndex = points.length - 1;

  const yFor = (value: number) => MARGIN.top + CHART_H - (value / axisMax) * CHART_H;

  const hoveredPoint = hovered != null ? points[hovered] : null;
  const tooltipX = hovered != null ? ((MARGIN.left + (hovered + 0.5) * bandWidth) / VIEW_W) * 100 : 0;
  const tooltipY = hoveredPoint ? (yFor(hoveredPoint.value) / VIEW_H) * 100 : 0;

  return (
    <div className="relative w-full" style={{ aspectRatio: `${VIEW_W} / ${VIEW_H}` }}>
      <svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        preserveAspectRatio="none"
        className="size-full overflow-visible"
        role="img"
        aria-label={ariaLabel}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line
              x1={MARGIN.left}
              x2={VIEW_W - MARGIN.right}
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
              className="fill-muted-foreground text-[9px] tabular-nums"
            >
              {t}
            </text>
          </g>
        ))}

        {points.map((point, i) => {
          const x = MARGIN.left + i * bandWidth + (bandWidth - barWidth) / 2;
          const height = (point.value / axisMax) * CHART_H;
          const y = MARGIN.top + CHART_H - height;
          const showLabel = points.length <= 8 || (lastIndex - i) % 2 === 0;

          return (
            <g key={point.weekStart}>
              {/* Full-column hit target, taller than the bar itself. */}
              <rect
                x={MARGIN.left + i * bandWidth}
                y={MARGIN.top}
                width={bandWidth}
                height={CHART_H}
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
              {point.isCurrentWeek && point.value > 0 ? (
                <text
                  x={x + barWidth / 2}
                  y={y - 6}
                  textAnchor="middle"
                  className="fill-foreground text-[10px] font-medium tabular-nums"
                >
                  {formatValue(point.value)}
                </text>
              ) : null}
              {showLabel ? (
                <text
                  x={x + barWidth / 2}
                  y={VIEW_H - MARGIN.bottom + 14}
                  textAnchor="middle"
                  className={cn('text-[9px]', point.isCurrentWeek ? 'fill-foreground font-medium' : 'fill-muted-foreground')}
                >
                  {point.label}
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>

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
