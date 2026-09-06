import { Badge } from '~/components/ui/badge';
import type { WorkoutExerciseView } from '~/services/workout-service.server';

/**
 * A structured target rendered as discrete chips ("3 sets", "8 reps",
 * "135 lb") rather than one joined line - the workout builder's canvas rows
 * and the "Today" exercise cards both want this shape, `targetSummary`'s one
 * line is what the mobile card and history still use instead.
 */
function TargetChips({ target }: { target: WorkoutExerciseView['target'] }) {
  if (!target) return null;

  const chips: string[] = [];
  if (target.sets !== null) chips.push(`${target.sets} set${target.sets === 1 ? '' : 's'}`);
  if (target.reps !== null) chips.push(`${target.reps} rep${target.reps === 1 ? '' : 's'}`);
  if (target.weight) chips.push(target.weight);
  if (target.duration) chips.push(target.duration);
  if (target.speed) chips.push(target.speed);
  if (target.resistance !== null) chips.push(`resistance ${target.resistance}`);
  if (target.rest) chips.push(`${target.rest} rest`);

  if (chips.length === 0) return null;

  return (
    <>
      {chips.map((chip) => (
        <Badge key={chip} variant="outline" className="font-normal">
          {chip}
        </Badge>
      ))}
    </>
  );
}

export { TargetChips };
