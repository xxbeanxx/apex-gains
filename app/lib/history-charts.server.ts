import type { WorkoutSessionWithSets } from "~/repositories/workout-sessions-repository";

import { addDays, formatMonthDay, todayDateString } from "./cycle";

/** The Monday on or before `dateStr` - the week bucket a date belongs to. */
function mondayOnOrBefore(dateStr: string): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  const dayOfWeek = new Date(Date.UTC(year, month - 1, day)).getUTCDay(); // 0 Sun - 6 Sat
  const offsetToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  return addDays(dateStr, offsetToMonday);
}

export type WeeklyVolumePoint = {
  weekStart: string;
  label: string;
  setCount: number;
  isCurrentWeek: boolean;
};

/**
 * Total sets logged per week for the `weeks` weeks up to and including the
 * one containing `today`, oldest first. Weeks with no session rows still
 * appear with a zero count, so a gap in training shows up as a gap in the
 * chart rather than a shorter x-axis.
 */
export function computeWeeklyVolume(
  sessions: WorkoutSessionWithSets[],
  weeks: number,
  today: string = todayDateString(),
): WeeklyVolumePoint[] {
  const currentWeekStart = mondayOnOrBefore(today);

  const points: WeeklyVolumePoint[] = Array.from({ length: weeks }, (_, i) => {
    const weekStart = addDays(currentWeekStart, -7 * (weeks - 1 - i));
    return {
      weekStart,
      label: formatMonthDay(weekStart),
      setCount: 0,
      isCurrentWeek: weekStart === currentWeekStart,
    };
  });

  const byWeekStart = new Map(points.map((p) => [p.weekStart, p]));
  for (const session of sessions) {
    const point = byWeekStart.get(mondayOnOrBefore(session.date));
    if (point) point.setCount += session.sets.length;
  }

  return points;
}

export type ExerciseProgressSeries = {
  exerciseId: string;
  exerciseName: string;
  metricLabel: string;
  unit: string;
  points: { date: string; value: number }[];
};

/** Epley formula: a standard estimate of a one-rep max from a lighter set. */
function estimatedOneRepMax(weight: number, reps: number): number {
  return weight * (1 + reps / 30);
}

/**
 * One series per exercise that was logged on at least two distinct days,
 * tracking a single "getting better at this" metric over time: estimated
 * best-set 1RM for weighted strength work, rep count for bodyweight-only
 * strength work, and duration for cardio. Each exercise picks one metric for
 * its whole series (based on whether it ever had a weighted set) so the
 * y-axis never mixes units within a line.
 */
export function computeExerciseProgressSeries(
  sessions: WorkoutSessionWithSets[],
): ExerciseProgressSeries[] {
  type RawEntry = {
    date: string;
    weight: number | null;
    reps: number | null;
    durationSeconds: number | null;
  };
  const rawByExercise = new Map<
    string,
    { name: string; type: "strength" | "cardio"; entries: RawEntry[] }
  >();

  for (const session of sessions) {
    for (const set of session.sets) {
      const exercise = set.exercise;
      let group = rawByExercise.get(exercise.id);
      if (!group) {
        group = { name: exercise.name, type: exercise.exerciseType, entries: [] };
        rawByExercise.set(exercise.id, group);
      }
      group.entries.push({
        date: session.date,
        weight: set.weight != null ? Number(set.weight) : null,
        reps: set.reps,
        durationSeconds: set.durationSeconds,
      });
    }
  }

  const series: ExerciseProgressSeries[] = [];
  for (const [exerciseId, group] of rawByExercise) {
    const usesWeight = group.entries.some(
      (e) => e.weight != null && e.reps != null,
    );
    const metricLabel =
      group.type === "cardio"
        ? "Duration"
        : usesWeight
          ? "Est. best set (1RM)"
          : "Best set";
    const unit = group.type === "cardio" ? "min" : usesWeight ? "lb" : "reps";

    const bestByDate = new Map<string, number>();
    for (const entry of group.entries) {
      const value =
        group.type === "cardio"
          ? entry.durationSeconds != null
            ? entry.durationSeconds / 60
            : null
          : usesWeight
            ? entry.weight != null && entry.reps != null
              ? estimatedOneRepMax(entry.weight, entry.reps)
              : null
            : entry.reps;
      if (value == null) continue;

      const prior = bestByDate.get(entry.date);
      if (prior == null || value > prior) bestByDate.set(entry.date, value);
    }

    if (bestByDate.size < 2) continue;

    const points = [...bestByDate.entries()]
      .map(([date, value]) => ({ date, value }))
      .sort((a, b) => (a.date < b.date ? -1 : 1));

    series.push({ exerciseId, exerciseName: group.name, metricLabel, unit, points });
  }

  return series.sort((a, b) => b.points.length - a.points.length);
}
