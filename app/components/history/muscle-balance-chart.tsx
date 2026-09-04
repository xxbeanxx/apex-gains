import type { MuscleBalanceView } from '~/services/progress-view';

import { niceAxisStep, roundedRightBarPath, useChartWidth } from './chart-utils';

const ROW_H = 30;
const BAR_H = 18;
const MARGIN = { top: 4, right: 40, bottom: 4, left: 96 };

export function MuscleBalanceChart({ groups }: { groups: MuscleBalanceView[] }) {
  const [ref, width] = useChartWidth<HTMLDivElement>();
  const chartW = Math.max(0, width - MARGIN.left - MARGIN.right);
  const height = MARGIN.top + MARGIN.bottom + groups.length * ROW_H;

  const maxValue = Math.max(0, ...groups.map((g) => g.setCount));
  const step = niceAxisStep(maxValue);
  const axisMax = maxValue > 0 ? Math.ceil(maxValue / step) * step : step;

  return (
    <div ref={ref} className="w-full" style={{ height }}>
      {width > 0 ? (
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="size-full overflow-visible"
          role="img"
          aria-label={`Sets by muscle group, most trained first: ${groups.map((g) => `${g.muscleGroup} ${g.setCount}`).join(', ')}`}
        >
          {groups.map((group, i) => {
            const rowY = MARGIN.top + i * ROW_H;
            const barY = rowY + (ROW_H - BAR_H) / 2;
            const barWidth = axisMax > 0 ? (group.setCount / axisMax) * chartW : 0;

            return (
              <g key={group.muscleGroup}>
                <text
                  x={MARGIN.left - 8}
                  y={rowY + ROW_H / 2}
                  textAnchor="end"
                  dominantBaseline="middle"
                  className="fill-foreground text-[11px]"
                >
                  {group.muscleGroup}
                </text>
                {barWidth > 0 ? (
                  <path d={roundedRightBarPath(MARGIN.left, barY, barWidth, BAR_H, 4)} className="fill-brand-strong" />
                ) : null}
                <text
                  x={MARGIN.left + barWidth + 6}
                  y={rowY + ROW_H / 2}
                  dominantBaseline="middle"
                  className="fill-muted-foreground text-[11px] tabular-nums"
                >
                  {group.setCount}
                </text>
              </g>
            );
          })}
        </svg>
      ) : null}
    </div>
  );
}
