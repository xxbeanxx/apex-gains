import type { MuscleGroup } from '~domain/exercise/muscle-group';
import type { TrainingHistory } from '~domain/progress/training-history';
import type { DateOnly } from '~domain/values/date-only';

export type MuscleGroupVolume = {
  readonly muscleGroup: MuscleGroup | typeof OTHER_MUSCLE_GROUP;
  readonly setCount: number;
};

export const OTHER_MUSCLE_GROUP = 'Other';
const MAX_MUSCLE_GROUPS = 8;

/**
 * Sets per muscle group over the last `days` days, most-trained first - for
 * spotting an imbalance ("all chest, no back"). An exercise with no muscle
 * group, and anything past the top `MAX_MUSCLE_GROUPS`, folds into "Other"
 * so the chart stays readable.
 */
export function muscleGroupBalance(history: TrainingHistory, days: number, today: DateOnly): MuscleGroupVolume[] {
  const recent = history.within(today.minusDays(days - 1), today);
  const counts = new Map<MuscleGroup | typeof OTHER_MUSCLE_GROUP, number>();

  for (const { set } of recent.entries()) {
    const key = recent.exerciseFor(set.exerciseId)?.muscleGroup ?? OTHER_MUSCLE_GROUP;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const sorted = [...counts.entries()]
    .map(([muscleGroup, setCount]) => ({ muscleGroup, setCount }))
    .sort((a, b) => b.setCount - a.setCount);

  const top = sorted.slice(0, MAX_MUSCLE_GROUPS - 1);
  const overflow = sorted.slice(MAX_MUSCLE_GROUPS - 1);
  if (overflow.length === 0) return top;

  const overflowCount = overflow.reduce((sum, group) => sum + group.setCount, 0);
  const existingOther = top.find((point) => point.muscleGroup === OTHER_MUSCLE_GROUP);
  if (existingOther) {
    return top.map((point) => (point === existingOther ? { ...point, setCount: point.setCount + overflowCount } : point));
  }
  return [...top, { muscleGroup: OTHER_MUSCLE_GROUP, setCount: overflowCount }];
}
