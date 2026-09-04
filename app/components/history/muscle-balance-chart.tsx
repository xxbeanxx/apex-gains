import type { MuscleBalanceView } from '~/services/progress-view';

import { niceAxisStep, roundedRightBarPath } from './chart-utils';

const VIEW_W = 600;
const ROW_H = 30;
const BAR_H = 18;
const MARGIN = { top: 4, right: 40, bottom: 4, left: 96 };

export function MuscleBalanceChart({ groups }: { groups: MuscleBalanceView[] }) {
  const chartW = VIEW_W - MARGIN.left - MARGIN.right;
  const viewH = MARGIN.top + MARGIN.bottom + groups.length * ROW_H;

  const maxValue = Math.max(0, ...groups.map((g) => g.setCount));
  const step = niceAxisStep(maxValue);
  const axisMax = maxValue > 0 ? Math.ceil(maxValue / step) * step : step;

  return (
    <div className="w-full" style={{ aspectRatio: `${VIEW_W} / ${viewH}` }}>
      <svg
        viewBox={`0 0 ${VIEW_W} ${viewH}`}
        preserveAspectRatio="none"
        className="size-full overflow-visible"
        role="img"
        aria-label={`Sets by muscle group, most trained first: ${groups.map((g) => `${g.muscleGroup} ${g.setCount}`).join(', ')}`}
      >
        {groups.map((group, i) => {
          const rowY = MARGIN.top + i * ROW_H;
          const barY = rowY + (ROW_H - BAR_H) / 2;
          const width = axisMax > 0 ? (group.setCount / axisMax) * chartW : 0;

          return (
            <g key={group.muscleGroup}>
              <text
                x={MARGIN.left - 8}
                y={rowY + ROW_H / 2}
                textAnchor="end"
                dominantBaseline="middle"
                className="fill-foreground text-[10px]"
              >
                {group.muscleGroup}
              </text>
              {width > 0 ? (
                <path d={roundedRightBarPath(MARGIN.left, barY, width, BAR_H, 4)} className="fill-brand-strong" />
              ) : null}
              <text
                x={MARGIN.left + width + 6}
                y={rowY + ROW_H / 2}
                dominantBaseline="middle"
                className="fill-muted-foreground text-[10px] tabular-nums"
              >
                {group.setCount}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
