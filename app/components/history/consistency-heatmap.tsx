import { useState } from 'react';

import { formatFullDate } from '~/lib/format';
import type { HeatmapDayView } from '~/services/progress-view';

import { ChartTooltip } from './chart-tooltip';

const CELL = 12;
const GAP = 3;
const STEP = CELL + GAP;
// `top` is much bigger than the month-label row actually needs: the
// tooltip anchors above the hovered cell (like the other charts), and row
// 0 needs that much headroom *within this component's own box* to clear
// without the card's overflow-hidden clipping it.
const MARGIN = { top: 56, right: 4, bottom: 4, left: 28 };

/** 0 (nothing logged) through 4 (a big day), for the fill-opacity ramp below. */
function levelForSetCount(setCount: number): number {
  if (setCount <= 0) return 0;
  if (setCount <= 2) return 1;
  if (setCount <= 4) return 2;
  if (setCount <= 6) return 3;
  return 4;
}
const LEVEL_OPACITY = [0, 0.28, 0.52, 0.76, 1];
const WEEKDAY_LABELS: Record<number, string> = { 0: 'Mon', 2: 'Wed', 4: 'Fri' };

/** "2026-09-02" -> "Sep", for the month markers along the top. */
function shortMonthLabel(dateStr: string): string {
  const [year, month] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString(undefined, { month: 'short' });
}

export function ConsistencyHeatmap({ days }: { days: HeatmapDayView[] }) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const weeks = days.length / 7;
  const chartW = MARGIN.left + MARGIN.right + weeks * STEP - GAP;
  const chartH = MARGIN.top + MARGIN.bottom + 7 * STEP - GAP;

  const monthLabels: { col: number; label: string }[] = [];
  let lastMonth = '';
  for (let col = 0; col < weeks; col++) {
    const month = days[col * 7].date.slice(0, 7);
    if (month !== lastMonth) {
      monthLabels.push({ col, label: shortMonthLabel(days[col * 7].date) });
      lastMonth = month;
    }
  }

  const hovered = hoveredIndex != null ? days[hoveredIndex] : null;
  const hoveredCol = hoveredIndex != null ? Math.floor(hoveredIndex / 7) : 0;
  const hoveredRow = hoveredIndex != null ? hoveredIndex % 7 : 0;
  // Clamped so the tooltip (wide relative to this narrow chart) doesn't
  // clip against the card's left/right edge for the outermost columns.
  const tooltipX = Math.min(85, Math.max(15, ((MARGIN.left + hoveredCol * STEP + CELL / 2) / chartW) * 100));
  const tooltipY = ((MARGIN.top + hoveredRow * STEP) / chartH) * 100;

  return (
    // No overflow-x-auto scroller here on purpose: giving this element
    // scrollable overflow on one axis forces the other axis to `auto` too
    // (a CSS quirk), which clips the tooltip - and once it's clipped once,
    // the browser keeps a vertical scrollbar around for every hover after.
    // HEATMAP_WEEKS is sized so `chartW` fits without scrolling instead.
    <div className="relative" style={{ width: chartW, maxWidth: '100%' }}>
      <svg
        viewBox={`0 0 ${chartW} ${chartH}`}
        width={chartW}
        height={chartH}
        role="img"
        aria-label={`Training consistency for the last ${weeks} weeks`}
      >
        {monthLabels.map(({ col, label }) => (
          <text key={col} x={MARGIN.left + col * STEP} y={MARGIN.top - 8} className="fill-muted-foreground text-[10px]">
            {label}
          </text>
        ))}
        {Object.entries(WEEKDAY_LABELS).map(([row, label]) => (
          <text
            key={row}
            x={MARGIN.left - 6}
            y={MARGIN.top + Number(row) * STEP + CELL / 2}
            textAnchor="end"
            dominantBaseline="middle"
            className="fill-muted-foreground text-[10px]"
          >
            {label}
          </text>
        ))}

        {days.map((day, i) => {
          const col = Math.floor(i / 7);
          const row = i % 7;
          const x = MARGIN.left + col * STEP;
          const y = MARGIN.top + row * STEP;
          const level = levelForSetCount(day.setCount);

          return (
            <g key={day.date}>
              <rect
                x={x}
                y={y}
                width={CELL}
                height={CELL}
                rx={2}
                className={level === 0 ? 'fill-muted stroke-border' : 'fill-brand-strong'}
                strokeWidth={level === 0 ? 1 : 0}
                fillOpacity={level === 0 ? 1 : LEVEL_OPACITY[level]}
                onPointerEnter={() => setHoveredIndex(i)}
                onPointerLeave={() => setHoveredIndex((h) => (h === i ? null : h))}
                onFocus={() => setHoveredIndex(i)}
                onBlur={() => setHoveredIndex((h) => (h === i ? null : h))}
                tabIndex={0}
              />
              {day.status === 'rest' ? (
                <circle cx={x + CELL / 2} cy={y + CELL / 2} r={1.5} className="fill-muted-foreground" pointerEvents="none" />
              ) : null}
            </g>
          );
        })}
      </svg>

      <ChartTooltip x={tooltipX} y={tooltipY} visible={hovered != null}>
        {hovered ? (
          <>
            <div className="font-semibold">
              {hovered.status === 'workout'
                ? `${hovered.setCount} set${hovered.setCount === 1 ? '' : 's'}`
                : hovered.status === 'rest'
                  ? 'Rest day'
                  : 'No session logged'}
            </div>
            <div className="text-muted-foreground">{formatFullDate(hovered.date)}</div>
          </>
        ) : null}
      </ChartTooltip>
    </div>
  );
}
