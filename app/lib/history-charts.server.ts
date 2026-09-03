import type { WorkoutSessionWithSets } from "~/repositories/workout-sessions-repository";

import { addDays, formatMonthDay, todayDateString } from "./cycle";

/** The Monday on or before `dateStr` - the week bucket a date belongs to. */
function mondayOnOrBefore(dateStr: string): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  const dayOfWeek = new Date(Date.UTC(year, month - 1, day)).getUTCDay(); // 0 Sun - 6 Sat
  const offsetToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  return addDays(dateStr, offsetToMonday);
}

export type WeeklyMetricPoint = {
  weekStart: string;
  label: string;
  value: number;
  isCurrentWeek: boolean;
};

/** Shared bucketing for any "sum of X per week" chart - see the two callers below. */
function computeWeeklyMetric(
  sessions: WorkoutSessionWithSets[],
  weeks: number,
  today: string,
  valueForSession: (session: WorkoutSessionWithSets) => number,
): WeeklyMetricPoint[] {
  const currentWeekStart = mondayOnOrBefore(today);

  const points: WeeklyMetricPoint[] = Array.from({ length: weeks }, (_, i) => {
    const weekStart = addDays(currentWeekStart, -7 * (weeks - 1 - i));
    return {
      weekStart,
      label: formatMonthDay(weekStart),
      value: 0,
      isCurrentWeek: weekStart === currentWeekStart,
    };
  });

  const byWeekStart = new Map(points.map((p) => [p.weekStart, p]));
  for (const session of sessions) {
    const point = byWeekStart.get(mondayOnOrBefore(session.date));
    if (point) point.value += valueForSession(session);
  }

  return points;
}

/**
 * Total sets logged per week for the `weeks` weeks up to and including the
 * one containing `today`, oldest first. Weeks with no session rows still
 * appear with a zero count, so a gap in training shows up as a gap in the
 * chart rather than a shorter x-axis.
 */
export function computeWeeklySetCount(
  sessions: WorkoutSessionWithSets[],
  weeks: number,
  today: string = todayDateString(),
): WeeklyMetricPoint[] {
  return computeWeeklyMetric(sessions, weeks, today, (session) => session.sets.length);
}

/**
 * Total tonnage (sum of weight x reps, lb) per week. Only strength sets that
 * logged both a weight and a rep count contribute - bodyweight-only sets and
 * cardio sets have no weight to sum, so they add zero rather than skewing
 * the total.
 */
export function computeWeeklyTonnage(
  sessions: WorkoutSessionWithSets[],
  weeks: number,
  today: string = todayDateString(),
): WeeklyMetricPoint[] {
  return computeWeeklyMetric(sessions, weeks, today, (session) =>
    session.sets.reduce((sum, set) => {
      if (set.weight == null || set.reps == null) return sum;
      return sum + Number(set.weight) * set.reps;
    }, 0),
  );
}

export type HeatmapDay = {
  date: string;
  status: "workout" | "rest" | "none";
  setCount: number;
};

/**
 * One entry per day for the `weeks` weeks up to and including the one
 * containing `today`, Monday-aligned so the caller can lay it out as a
 * 7-row-by-`weeks`-column grid (GitHub-contributions style).
 */
export function computeConsistencyHeatmap(
  sessions: WorkoutSessionWithSets[],
  weeks: number,
  today: string = todayDateString(),
): HeatmapDay[] {
  const startDate = addDays(mondayOnOrBefore(today), -7 * (weeks - 1));
  const byDate = new Map(sessions.map((s) => [s.date, s]));

  return Array.from({ length: weeks * 7 }, (_, i) => {
    const date = addDays(startDate, i);
    const session = byDate.get(date);
    if (!session) return { date, status: "none" as const, setCount: 0 };
    if (session.sets.length > 0) {
      return { date, status: "workout" as const, setCount: session.sets.length };
    }
    return {
      date,
      status: session.isRestDay ? ("rest" as const) : ("none" as const),
      setCount: 0,
    };
  });
}

export type MuscleGroupBalancePoint = {
  muscleGroup: string;
  setCount: number;
};

const OTHER_MUSCLE_GROUP = "Other";
const MAX_MUSCLE_GROUPS = 8;

/**
 * Sets logged per muscle group in the last `days` days, most-trained first,
 * for spotting an imbalance ("all chest, no back"). `muscleGroup` is
 * freeform text on the exercise, not an enum, so entries are grouped
 * case-insensitively and anything blank (or past the top `MAX_MUSCLE_GROUPS`)
 * folds into "Other".
 */
export function computeMuscleGroupBalance(
  sessions: WorkoutSessionWithSets[],
  days: number,
  today: string = todayDateString(),
): MuscleGroupBalancePoint[] {
  const startDate = addDays(today, -(days - 1));
  const byKey = new Map<string, { label: string; setCount: number }>();

  for (const session of sessions) {
    if (session.date < startDate || session.date > today) continue;
    for (const set of session.sets) {
      const raw = set.exercise.muscleGroup?.trim();
      const key = raw ? raw.toLowerCase() : OTHER_MUSCLE_GROUP;
      const existing = byKey.get(key);
      if (existing) existing.setCount += 1;
      else byKey.set(key, { label: raw || OTHER_MUSCLE_GROUP, setCount: 1 });
    }
  }

  const sorted = [...byKey.values()].sort((a, b) => b.setCount - a.setCount);
  const points = sorted
    .slice(0, MAX_MUSCLE_GROUPS - 1)
    .map((g) => ({ muscleGroup: g.label, setCount: g.setCount }));

  const overflow = sorted.slice(MAX_MUSCLE_GROUPS - 1);
  if (overflow.length > 0) {
    const overflowCount = overflow.reduce((sum, g) => sum + g.setCount, 0);
    const existingOther = points.find((p) => p.muscleGroup === OTHER_MUSCLE_GROUP);
    if (existingOther) existingOther.setCount += overflowCount;
    else points.push({ muscleGroup: OTHER_MUSCLE_GROUP, setCount: overflowCount });
  }

  return points;
}

type ExerciseMetricGroup = {
  exerciseId: string;
  exerciseName: string;
  metricLabel: string;
  unit: string;
  bestByDate: Map<string, number>;
};

/** Epley formula: a standard estimate of a one-rep max from a lighter set. */
function estimatedOneRepMax(weight: number, reps: number): number {
  return weight * (1 + reps / 30);
}

/**
 * Per exercise, the single "getting better at this" metric and its best
 * value on each day it was logged: estimated best-set 1RM for weighted
 * strength work, rep count for bodyweight-only strength work, and duration
 * for cardio. Each exercise picks one metric for its whole history (based on
 * whether it ever had a weighted set) so values never mix units.
 *
 * Shared by computeExerciseProgressSeries (trend lines) and
 * computePersonalRecords (all-time bests) - the two just apply different
 * filters/sorts on top of the same per-day bests.
 */
function groupExerciseMetrics(
  sessions: WorkoutSessionWithSets[],
): ExerciseMetricGroup[] {
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

  const groups: ExerciseMetricGroup[] = [];
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

    if (bestByDate.size === 0) continue;
    groups.push({ exerciseId, exerciseName: group.name, metricLabel, unit, bestByDate });
  }

  return groups;
}

export type ExerciseProgressSeries = {
  exerciseId: string;
  exerciseName: string;
  metricLabel: string;
  unit: string;
  points: { date: string; value: number }[];
};

/** One series per exercise logged on at least two distinct days, most-tracked first. */
export function computeExerciseProgressSeries(
  sessions: WorkoutSessionWithSets[],
): ExerciseProgressSeries[] {
  return groupExerciseMetrics(sessions)
    .filter((g) => g.bestByDate.size >= 2)
    .map((g) => ({
      exerciseId: g.exerciseId,
      exerciseName: g.exerciseName,
      metricLabel: g.metricLabel,
      unit: g.unit,
      points: [...g.bestByDate.entries()]
        .map(([date, value]) => ({ date, value }))
        .sort((a, b) => (a.date < b.date ? -1 : 1)),
    }))
    .sort((a, b) => b.points.length - a.points.length);
}

export type PersonalRecord = {
  exerciseId: string;
  exerciseName: string;
  metricLabel: string;
  unit: string;
  value: number;
  date: string;
};

/** Each exercise's all-time best, most-recently-set first. Ties go to the earlier date. */
export function computePersonalRecords(
  sessions: WorkoutSessionWithSets[],
): PersonalRecord[] {
  const records = groupExerciseMetrics(sessions).map((g) => {
    const entries = [...g.bestByDate.entries()];
    let [bestDate, bestValue] = entries[0];
    for (const [date, value] of entries.slice(1)) {
      if (value > bestValue || (value === bestValue && date < bestDate)) {
        bestDate = date;
        bestValue = value;
      }
    }
    return {
      exerciseId: g.exerciseId,
      exerciseName: g.exerciseName,
      metricLabel: g.metricLabel,
      unit: g.unit,
      value: bestValue,
      date: bestDate,
    };
  });

  return records.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}
