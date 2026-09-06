import { Badge } from '~/components/ui/badge';
import { Card, CardContent } from '~/components/ui/card';
import type { EquipmentView, ExerciseView } from '~application/use-cases/exercise-library-service';

import { ExerciseRowMenu } from './exercise-row-menu';
import { SourceBadge, sourceOf } from './exercise-source';

import { typeLabels } from '~/routes/exercises';

function ExerciseCard({ exercise, allEquipment }: { exercise: ExerciseView; allEquipment: EquipmentView[] }) {
  return (
    <Card>
      <CardContent className="flex items-start gap-2 py-3">
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <div className="flex items-center gap-2">
            {exercise.muscleGroup ? (
              <Badge variant="outline" className="shrink-0">
                {exercise.muscleGroup}
              </Badge>
            ) : null}
            <span className="truncate font-medium text-pretty">{exercise.name}</span>
          </div>
          <p className="text-sm text-muted-foreground">
            {typeLabels[exercise.exerciseType]}
            {exercise.equipment.length > 0 ? ` · ${exercise.equipment.map((item) => item.name).join(', ')}` : ''}
          </p>
          <SourceBadge source={sourceOf(exercise)} />
        </div>
        <ExerciseRowMenu exercise={exercise} allEquipment={allEquipment} />
      </CardContent>
    </Card>
  );
}

export { ExerciseCard };
