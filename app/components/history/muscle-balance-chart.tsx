import { Bar, BarChart, LabelList, XAxis, YAxis } from 'recharts';

import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from '~/components/ui/chart';
import type { MuscleBalanceView } from '~/services/progress-view';

const ROW_HEIGHT = 30;

const config = {
  setCount: { label: 'Sets', color: 'var(--brand-strong)' },
} satisfies ChartConfig;

export function MuscleBalanceChart({ groups }: { groups: MuscleBalanceView[] }) {
  return (
    <ChartContainer config={config} className="aspect-auto w-full" style={{ height: groups.length * ROW_HEIGHT }}>
      <BarChart
        data={groups}
        layout="vertical"
        margin={{ top: 0, right: 40, left: 0, bottom: 0 }}
        role="img"
        aria-label={`Sets by muscle group, most trained first: ${groups.map((g) => `${g.muscleGroup} ${g.setCount}`).join(', ')}`}
      >
        {
          // The count sits beside each bar, so the value axis itself is
          // redundant - the rows are a ranking, not a reading off a scale.
        }
        <XAxis type="number" dataKey="setCount" hide />
        <YAxis type="category" dataKey="muscleGroup" tickLine={false} axisLine={false} tickMargin={8} width={104} />
        <ChartTooltip cursor={{ fill: 'var(--muted)', fillOpacity: 0.5 }} content={<ChartTooltipContent />} />
        <Bar dataKey="setCount" fill="var(--color-setCount)" radius={[0, 4, 4, 0]} barSize={18} isAnimationActive={false}>
          <LabelList
            dataKey="setCount"
            position="right"
            offset={8}
            className="fill-muted-foreground text-[11px] tabular-nums"
          />
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}
