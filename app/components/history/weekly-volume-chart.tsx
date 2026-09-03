import { useState } from "react";

import { cn } from "~/lib/utils";
import type { WeeklyVolumePoint } from "~/lib/history-charts.server";

import { ChartTooltip } from "./chart-tooltip";
import { axisTicks, niceAxisStep, roundedTopBarPath } from "./chart-utils";

const VIEW_W = 600;
const VIEW_H = 220;
const MARGIN = { top: 24, right: 8, bottom: 24, left: 26 };
const CHART_W = VIEW_W - MARGIN.left - MARGIN.right;
const CHART_H = VIEW_H - MARGIN.top - MARGIN.bottom;

export function WeeklyVolumeChart({ weeks }: { weeks: WeeklyVolumePoint[] }) {
  const [hovered, setHovered] = useState<number | null>(null);

  const maxCount = Math.max(0, ...weeks.map((w) => w.setCount));
  const step = niceAxisStep(maxCount);
  const axisMax = maxCount > 0 ? Math.ceil(maxCount / step) * step : step * 4;
  const ticks = axisTicks(axisMax, step);

  const bandWidth = CHART_W / weeks.length;
  const barWidth = Math.min(24, bandWidth * 0.55);
  const lastIndex = weeks.length - 1;

  const yFor = (value: number) => MARGIN.top + CHART_H - (value / axisMax) * CHART_H;

  const hoveredWeek = hovered != null ? weeks[hovered] : null;
  const tooltipX = hovered != null ? ((MARGIN.left + (hovered + 0.5) * bandWidth) / VIEW_W) * 100 : 0;
  const tooltipY = hoveredWeek ? (yFor(hoveredWeek.setCount) / VIEW_H) * 100 : 0;

  return (
    <div
      className="relative w-full"
      style={{ aspectRatio: `${VIEW_W} / ${VIEW_H}` }}
    >
      <svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        preserveAspectRatio="none"
        className="size-full overflow-visible"
        role="img"
        aria-label={`Sets logged per week, from ${weeks[0]?.label} to ${weeks[lastIndex]?.label}`}
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

        {weeks.map((week, i) => {
          const x = MARGIN.left + i * bandWidth + (bandWidth - barWidth) / 2;
          const height = (week.setCount / axisMax) * CHART_H;
          const y = MARGIN.top + CHART_H - height;
          const showLabel = weeks.length <= 8 || (lastIndex - i) % 2 === 0;

          return (
            <g key={week.weekStart}>
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
                aria-label={`Week of ${week.label}: ${week.setCount} set${week.setCount === 1 ? "" : "s"}`}
              />
              {week.setCount > 0 ? (
                <path
                  d={roundedTopBarPath(x, y, barWidth, height, 4)}
                  className={cn(
                    "pointer-events-none transition-[fill] duration-(--dur-fast)",
                    hovered === i ? "fill-brand" : "fill-brand-strong"
                  )}
                />
              ) : null}
              {week.isCurrentWeek && week.setCount > 0 ? (
                <text
                  x={x + barWidth / 2}
                  y={y - 6}
                  textAnchor="middle"
                  className="fill-foreground text-[10px] font-medium tabular-nums"
                >
                  {week.setCount}
                </text>
              ) : null}
              {showLabel ? (
                <text
                  x={x + barWidth / 2}
                  y={VIEW_H - MARGIN.bottom + 14}
                  textAnchor="middle"
                  className={cn(
                    "text-[9px]",
                    week.isCurrentWeek ? "fill-foreground font-medium" : "fill-muted-foreground"
                  )}
                >
                  {week.label}
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>

      <ChartTooltip x={tooltipX} y={tooltipY} visible={hoveredWeek != null}>
        {hoveredWeek ? (
          <>
            <div className="font-semibold tabular-nums">
              {hoveredWeek.setCount} set{hoveredWeek.setCount === 1 ? "" : "s"}
            </div>
            <div className="text-muted-foreground">Week of {hoveredWeek.label}</div>
          </>
        ) : null}
      </ChartTooltip>
    </div>
  );
}
