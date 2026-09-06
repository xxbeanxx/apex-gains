import { Badge } from '~/components/ui/badge';
import { TableCell, TableRow } from '~/components/ui/table';
import type { EquipmentView, ExerciseView } from '~application/use-cases/exercise-library-service';

import { ExerciseRowMenu } from './exercise-row-menu';
import { SourceBadge, sourceOf } from './exercise-source';

import { typeLabels } from '~/routes/exercises';

function ExerciseTableRow({ exercise, allEquipment }: { exercise: ExerciseView; allEquipment: EquipmentView[] }) {
  return (
    <TableRow>
      <TableCell className="font-medium">
        <div className="flex items-center gap-2">
          {exercise.muscleGroup ? (
            <Badge variant="outline" className="shrink-0">
              {exercise.muscleGroup}
            </Badge>
          ) : null}
          <span className="text-pretty">{exercise.name}</span>
        </div>
      </TableCell>
      <TableCell className="text-muted-foreground">{typeLabels[exercise.exerciseType]}</TableCell>
      <TableCell className="text-muted-foreground">
        {exercise.equipment.length > 0 ? exercise.equipment.map((item) => item.name).join(', ') : '—'}
      </TableCell>
      <TableCell>
        <SourceBadge source={sourceOf(exercise)} />
      </TableCell>
      <TableCell>
        <ExerciseRowMenu exercise={exercise} allEquipment={allEquipment} />
      </TableCell>
    </TableRow>
  );
}

export { ExerciseTableRow };
