import { Badge } from '~/components/ui/badge';
import type { ExerciseView } from '~/services/exercise-library-service.server';

export type ExerciseSource = 'sample' | 'mine' | 'customized';

export const SOURCE_LABEL: Record<ExerciseSource, string> = {
  sample: 'Sample',
  mine: 'Mine',
  customized: 'Customized',
};

const SOURCE_BADGE_VARIANT = {
  sample: 'outline',
  mine: 'brand-subtle',
  customized: 'secondary',
} as const;

export function sourceOf(exercise: ExerciseView): ExerciseSource {
  if (exercise.isSample) return 'sample';
  return exercise.canRevert ? 'customized' : 'mine';
}

export function SourceBadge({ source }: { source: ExerciseSource }) {
  return <Badge variant={SOURCE_BADGE_VARIANT[source]}>{SOURCE_LABEL[source]}</Badge>;
}
