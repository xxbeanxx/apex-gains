import { TrendingUpIcon } from "lucide-react";
import { useState } from "react";

import { Card, CardAction, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { EmptyState } from "~/components/ui/empty-state";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import type {
  ExerciseProgressSeries,
  WeeklyVolumePoint,
} from "~/lib/history-charts.server";

import { ExerciseProgressChart } from "./exercise-progress-chart";
import { WeeklyVolumeChart } from "./weekly-volume-chart";

export function HistoryCharts({
  weeklyVolume,
  exerciseProgress,
}: {
  weeklyVolume: WeeklyVolumePoint[];
  exerciseProgress: ExerciseProgressSeries[];
}) {
  return (
    <div className="stagger grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Weekly volume</CardTitle>
        </CardHeader>
        <CardContent>
          <WeeklyVolumeChart weeks={weeklyVolume} />
        </CardContent>
      </Card>

      <ExerciseProgressCard series={exerciseProgress} />
    </div>
  );
}

function ExerciseProgressCard({ series }: { series: ExerciseProgressSeries[] }) {
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
            <p className="mb-2 text-xs text-muted-foreground">
              {selected.metricLabel}
            </p>
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
