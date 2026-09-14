import type { EquipmentView, ExerciseView } from '~application/use-cases/exercise-library-service';
import { ExerciseRowMenu } from '~web/components/exercises/exercise-row-menu';
import { SourceBadge, sourceOf } from '~web/components/exercises/exercise-source';
import { Badge } from '~web/components/ui/badge';
import { TableCell, TableRow } from '~web/components/ui/table';
import { typeLabels } from '~web/routes/exercises';

export function ExerciseTableRow({ exercise, allEquipment }: { exercise: ExerciseView; allEquipment: EquipmentView[] }) {
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
