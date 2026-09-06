import type { TrainingHistory } from '~domain/progress/training-history';
import type { DateOnly } from '~domain/values/date-only';

export type MuscleGroupVolume = {
  readonly muscleGroup: string;
  readonly setCount: number;
};

export const OTHER_MUSCLE_GROUP = 'Other';
const MAX_MUSCLE_GROUPS = 8;

/**
 * Sets per muscle group over the last `days` days, most-trained first - for
 * spotting an imbalance ("all chest, no back").
 *
 * `muscleGroup` is freeform text on the exercise rather than an enum, so
 * entries are grouped case-insensitively and the first spelling seen wins
 * the label. Anything blank, or past the top `MAX_MUSCLE_GROUPS`, folds into
 * "Other" so the chart stays readable.
 */
export function muscleGroupBalance(history: TrainingHistory, days: number, today: DateOnly): MuscleGroupVolume[] {
  const recent = history.within(today.minusDays(days - 1), today);
  const byKey = new Map<string, { label: string; setCount: number }>();

  for (const { set } of recent.entries()) {
    const raw = recent.exerciseFor(set.exerciseId)?.muscleGroup?.trim();
    const key = raw ? raw.toLowerCase() : OTHER_MUSCLE_GROUP;
    const existing = byKey.get(key);
    if (existing) existing.setCount += 1;
    else byKey.set(key, { label: raw || OTHER_MUSCLE_GROUP, setCount: 1 });
  }

  const sorted = [...byKey.values()].sort((a, b) => b.setCount - a.setCount);
  const top = sorted.slice(0, MAX_MUSCLE_GROUPS - 1).map((group) => ({
    muscleGroup: group.label,
    setCount: group.setCount,
  }));

  const overflow = sorted.slice(MAX_MUSCLE_GROUPS - 1);
  if (overflow.length > 0) {
    const overflowCount = overflow.reduce((sum, group) => sum + group.setCount, 0);
    const existingOther = top.find((point) => point.muscleGroup === OTHER_MUSCLE_GROUP);
    if (existingOther) {
      return top.map((point) => (point === existingOther ? { ...point, setCount: point.setCount + overflowCount } : point));
    }
    top.push({ muscleGroup: OTHER_MUSCLE_GROUP, setCount: overflowCount });
  }

  return top;
}
