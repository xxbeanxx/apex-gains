import { useMemo, useRef, useState } from "react";

import { DateOnly } from "~/domain/values/date-only";
import { formatMonthDay } from "~/lib/format";
import type { ProgressSeriesView } from "~/services/progress-view";

import { ChartTooltip } from "./chart-tooltip";
import { formatMetricValue } from "./chart-utils";

const VIEW_W = 600;
const VIEW_H = 220;
const MARGIN = { top: 20, right: 50, bottom: 22, left: 34 };
const CHART_W = VIEW_W - MARGIN.left - MARGIN.right;
const CHART_H = VIEW_H - MARGIN.top - MARGIN.bottom;

export function ExerciseProgressChart({ series }: { series: ProgressSeriesView }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hovered, setHovered] = useState<number | null>(null);

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

  const xFor = (date: string) =>
    MARGIN.left + (first.daysUntil(DateOnly.parse(date)) / totalDays) * CHART_W;
  const yFor = (value: number) =>
    MARGIN.top + CHART_H - ((value - yMin) / (yMax - yMin)) * CHART_H;

  const plotted = useMemo(
    () => points.map((p) => ({ ...p, x: xFor(p.date), y: yFor(p.value) })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [points, yMin, yMax],
  );

  const linePath = plotted.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");
  const baselineY = MARGIN.top + CHART_H;
  const areaPath = `${linePath} L${plotted[plotted.length - 1].x},${baselineY} L${plotted[0].x},${baselineY} Z`;

  const last = plotted[plotted.length - 1];
  const tickValues = [...new Set([yMin, (yMin + yMax) / 2, yMax].map((v) => Math.round(v)))];

  function nearestIndex(clientX: number): number {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return plotted.length - 1;
    const px = ((clientX - rect.left) / rect.width) * VIEW_W;
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
    <div className="relative w-full" style={{ aspectRatio: `${VIEW_W} / ${VIEW_H}` }}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        preserveAspectRatio="none"
        className="size-full overflow-visible"
        role="img"
        aria-label={`${series.metricLabel} for ${series.exerciseName}, from ${formatMonthDay(firstDate)} to ${formatMonthDay(lastDate)}: ${formatMetricValue(dataMin, series.unit)} to ${formatMetricValue(dataMax, series.unit)} ${series.unit}`}
      >
        {tickValues.map((t) => (
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

        {/* End marker: ring in the surface color, then the mark itself. */}
        <circle cx={last.x} cy={last.y} r={7} className="fill-card" />
        <circle cx={last.x} cy={last.y} r={4} className="fill-brand-strong" />
        <text
          x={last.x + 10}
          y={last.y}
          dominantBaseline="middle"
          className="fill-foreground text-[10px] font-medium tabular-nums"
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
          y={VIEW_H - MARGIN.bottom + 14}
          textAnchor="start"
          className="fill-muted-foreground text-[9px]"
        >
          {formatMonthDay(firstDate)}
        </text>
        <text
          x={VIEW_W - MARGIN.right}
          y={VIEW_H - MARGIN.bottom + 14}
          textAnchor="end"
          className="fill-muted-foreground text-[9px]"
        >
          {formatMonthDay(lastDate)}
        </text>

        <rect
          x={MARGIN.left}
          y={MARGIN.top}
          width={CHART_W}
          height={CHART_H}
          fill="transparent"
          onPointerMove={(e) => setHovered(nearestIndex(e.clientX))}
          onPointerLeave={() => setHovered(null)}
        />
      </svg>

      <ChartTooltip
        x={hoveredPoint ? (hoveredPoint.x / VIEW_W) * 100 : 0}
        y={hoveredPoint ? (hoveredPoint.y / VIEW_H) * 100 : 0}
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
