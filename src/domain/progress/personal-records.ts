import { Weight } from '../values/weight';
import type { TrainingHistory } from './training-history';

/**
 * Which single number stands for "getting better at this", per exercise.
 * Each exercise picks one for its whole history so values never mix units
 * mid-series.
 */
export type ProgressMetricKind = 'one-rep-max' | 'reps' | 'duration';

export type ExerciseProgress = {
  readonly exerciseId: string;
  readonly exerciseName: string;
  readonly kind: ProgressMetricKind;
  /**
   * Best value on each day it was logged, keyed by `YYYY-MM-DD`, in
   * canonical units: pounds for `one-rep-max`, a count for `reps`, seconds
   * for `duration`. Formatting for the athlete's units is the caller's job.
   */
  readonly bestByDate: ReadonlyMap<string, number>;
};

export type PersonalRecord = {
  readonly exerciseId: string;
  readonly exerciseName: string;
  readonly kind: ProgressMetricKind;
  readonly value: number;
  readonly date: string;
};

export type ProgressSeries = {
  readonly exerciseId: string;
  readonly exerciseName: string;
  readonly kind: ProgressMetricKind;
  readonly points: readonly { date: string; value: number }[];
};

/**
 * Epley's formula - the standard estimate of a one-rep max from a heavier
 * set of more reps, which is what makes 5x100 lb and 8x90 lb comparable on
 * one line.
 */
export function estimatedOneRepMax(weight: Weight, reps: number): Weight {
  return weight.times(1 + reps / 30);
}

/**
 * Per exercise, its metric and its best value on each day it was trained.
 *
 * Shared by the trend lines and the all-time bests below - the two differ
 * only in how they filter and sort these same per-day bests.
 */
export function exerciseProgress(history: TrainingHistory): ExerciseProgress[] {
  type Raw = { date: string; weight: Weight | null; reps: number | null; seconds: number | null };
  const collected = new Map<string, { name: string; isCardio: boolean; raw: Raw[] }>();

  for (const { session, set } of history.entries()) {
    const exercise = history.exerciseFor(set.exerciseId);
    if (!exercise) continue;

    let group = collected.get(exercise.id);
    if (!group) {
      group = { name: exercise.name, isCardio: exercise.isCardio, raw: [] };
      collected.set(exercise.id, group);
    }
    group.raw.push({
      date: session.date.value,
      weight: set.weight,
      reps: set.reps,
      seconds: set.duration?.inSeconds ?? null,
    });
  }

  const progress: ExerciseProgress[] = [];
  for (const [exerciseId, group] of collected) {
    // An exercise that has ever been loaded is tracked by estimated 1RM for
    // its whole history; one only ever done bodyweight is tracked by reps.
    const usesWeight = group.raw.some((entry) => entry.weight !== null && entry.reps !== null);
    const kind: ProgressMetricKind = group.isCardio ? 'duration' : usesWeight ? 'one-rep-max' : 'reps';

    const bestByDate = new Map<string, number>();
    for (const entry of group.raw) {
      const value = valueFor(kind, entry);
      if (value === null) continue;
      const prior = bestByDate.get(entry.date);
      if (prior === undefined || value > prior) {
        bestByDate.set(entry.date, value);
      }
    }

    if (bestByDate.size === 0) continue;
    progress.push({
      exerciseId,
      exerciseName: group.name,
      kind,
      bestByDate,
    });
  }

  return progress;

  function valueFor(kind: ProgressMetricKind, entry: Raw): number | null {
    if (kind === 'duration') return entry.seconds;
    if (kind === 'reps') return entry.reps;
    if (entry.weight === null || entry.reps === null) return null;
    return estimatedOneRepMax(entry.weight, entry.reps).inPounds;
  }
}

/**
 * One trend line per exercise trained on at least two distinct days - a
 * single data point is not a trend - most-tracked first.
 */
export function progressSeries(history: TrainingHistory): ProgressSeries[] {
  return exerciseProgress(history)
    .filter((progress) => progress.bestByDate.size >= 2)
    .map((progress) => ({
      exerciseId: progress.exerciseId,
      exerciseName: progress.exerciseName,
      kind: progress.kind,
      points: [...progress.bestByDate.entries()]
        .map(([date, value]) => ({ date, value }))
        .sort((a, b) => (a.date < b.date ? -1 : 1)),
    }))
    .sort((a, b) => b.points.length - a.points.length);
}

/** Each exercise's all-time best, most-recently-set first. Ties go to the earlier date. */
export function personalRecords(history: TrainingHistory): PersonalRecord[] {
  const records = exerciseProgress(history).map((progress) => {
    const entries = [...progress.bestByDate.entries()];
    let [bestDate, bestValue] = entries[0];
    for (const [date, value] of entries.slice(1)) {
      if (value > bestValue || (value === bestValue && date < bestDate)) {
        bestDate = date;
        bestValue = value;
      }
    }
    return {
      exerciseId: progress.exerciseId,
      exerciseName: progress.exerciseName,
      kind: progress.kind,
      value: bestValue,
      date: bestDate,
    };
  });

  return records.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}
