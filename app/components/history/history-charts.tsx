import { useState } from 'react';

import { ScaleIcon, TrendingUpIcon, TrophyIcon } from 'lucide-react';

import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card';
import { EmptyState } from '~/components/ui/empty-state';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/components/ui/select';
import type {
  HeatmapDayView,
  MuscleBalanceView,
  PersonalRecordView,
  ProgressSeriesView,
  WeeklyPointView,
} from '~application/use-cases/progress-view';

import { ConsistencyHeatmap } from './consistency-heatmap';
import { ExerciseProgressChart } from './exercise-progress-chart';
import { MuscleBalanceChart } from './muscle-balance-chart';
import { PersonalRecordsList } from './personal-records-list';
import { WeeklyBarChart } from './weekly-bar-chart';

export function HistoryCharts({
  heatmap,
  weeklySets,
  weeklyTonnage,
  tonnageUnit,
  exerciseProgress,
  muscleBalance,
  personalRecords,
  bodyWeight,
}: {
  heatmap: HeatmapDayView[];
  weeklySets: WeeklyPointView[];
  weeklyTonnage: WeeklyPointView[];
  tonnageUnit: string;
  exerciseProgress: ProgressSeriesView[];
  muscleBalance: MuscleBalanceView[];
  personalRecords: PersonalRecordView[];
  bodyWeight: ProgressSeriesView | null;
}) {
  return (
    <div className="stagger flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Consistency</CardTitle>
        </CardHeader>
        <CardContent>
          <ConsistencyHeatmap days={heatmap} />
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Weekly sets</CardTitle>
          </CardHeader>
          <CardContent>
            <WeeklyBarChart
              points={weeklySets}
              seriesLabel="Sets"
              formatValue={(v) => `${v} set${v === 1 ? '' : 's'}`}
              formatCompact={(v) => `${v}`}
              ariaLabel={`Sets logged per week, from ${weeklySets[0]?.label} to ${weeklySets.at(-1)?.label}`}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Weekly tonnage</CardTitle>
          </CardHeader>
          <CardContent>
            <WeeklyBarChart
              points={weeklyTonnage}
              seriesLabel="Tonnage"
              formatValue={(v) => `${Math.round(v).toLocaleString()} ${tonnageUnit}`}
              formatCompact={(v) => Math.round(v).toLocaleString()}
              ariaLabel={`Total weight lifted per week, from ${weeklyTonnage[0]?.label} to ${weeklyTonnage.at(-1)?.label}`}
            />
          </CardContent>
        </Card>
      </div>

      {bodyWeight ? (
        <Card>
          <CardHeader>
            <CardTitle>Body weight</CardTitle>
          </CardHeader>
          <CardContent>
            <ExerciseProgressChart series={bodyWeight} />
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <ExerciseProgressCard series={exerciseProgress} />
        <MuscleBalanceCard groups={muscleBalance} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Personal records</CardTitle>
          <CardDescription>
            For weighted exercises, this is an estimated one-rep max (Epley formula: weight × (1 + reps ÷ 30)), not the heaviest
            single set - so a lighter set of more reps can outrank a heavier, lower-rep one. Bodyweight and timed exercises
            instead show the best set or longest duration logged.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {personalRecords.length > 0 ? (
            <PersonalRecordsList records={personalRecords} />
          ) : (
            <EmptyState
              compact
              icon={TrophyIcon}
              title="No records yet"
              description="Log a set for any exercise and it'll show up here."
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ExerciseProgressCard({ series }: { series: ProgressSeriesView[] }) {
  const [selectedId, setSelectedId] = useState(series[0]?.exerciseId);
  const selected = series.find((s) => s.exerciseId === selectedId) ?? series[0];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Exercise progress</CardTitle>
        {series.length > 0 ? (
          <CardAction>
            <Select value={selected.exerciseId} onValueChange={setSelectedId}>
              <SelectTrigger size="sm" aria-label="Exercise">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {series.map((s) => (
                  <SelectItem key={s.exerciseId} value={s.exerciseId}>
                    {s.exerciseName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardAction>
        ) : null}
      </CardHeader>
      <CardContent>
        {selected ? (
          <>
            <p className="mb-2 text-xs text-muted-foreground">{selected.metricLabel}</p>
            <ExerciseProgressChart series={selected} />
          </>
        ) : (
          <EmptyState
            compact
            icon={TrendingUpIcon}
            title="Not enough data yet"
            description="Log the same exercise on two or more days to see a progress trend."
          />
        )}
      </CardContent>
    </Card>
  );
}

function MuscleBalanceCard({ groups }: { groups: MuscleBalanceView[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Muscle balance</CardTitle>
      </CardHeader>
      <CardContent>
        {groups.length > 0 ? (
          <MuscleBalanceChart groups={groups} />
        ) : (
          <EmptyState
            compact
            icon={ScaleIcon}
            title="Nothing in the last 4 weeks"
            description="Log a strength set and its muscle group will show up here."
          />
        )}
      </CardContent>
    </Card>
  );
}
