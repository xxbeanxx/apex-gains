import type { MeasurementValues } from '~application/shared/measurement-values';
import type { CardioFields } from '~domain/equipment/cardio-fields';
import type { ExerciseType } from '~domain/exercise/exercise-type';
import type { DistanceUnit, WeightUnit } from '~domain/values/units';

import { MeasurementField } from '~/components/measurement-field';
import { cn } from '~/lib/utils';

/**
 * The target inputs a strength or cardio exercise takes, posting under the
 * names `TargetFieldsDto` validates. Which of the two shows - and which
 * cardio fields within it - is decided once by the exercise's type and its
 * equipment's `cardioFields`, not re-derived by each form that renders one.
 */
function TargetFields({
  exerciseType,
  cardioFields,
  weightUnit,
  distanceUnit,
  defaultValues,
}: {
  exerciseType: ExerciseType;
  cardioFields: CardioFields;
  weightUnit: WeightUnit;
  distanceUnit: DistanceUnit;
  defaultValues?: MeasurementValues | null;
}) {
  const { showSpeed, showResistance } = cardioFields;
  const units = { weightUnit, distanceUnit };

  return (
    <>
      {exerciseType === 'strength' ? (
        <div className="grid grid-cols-3 gap-3">
          <MeasurementField name="sets" defaultValue={defaultValues?.sets} {...units} />
          <MeasurementField name="reps" defaultValue={defaultValues?.reps} {...units} />
          <MeasurementField name="weight" defaultValue={defaultValues?.weight} {...units} />
        </div>
      ) : null}

      {exerciseType === 'cardio' ? (
        <div className={cn('grid gap-3', showSpeed && showResistance ? 'grid-cols-3' : 'grid-cols-2')}>
          <MeasurementField name="durationMinutes" defaultValue={defaultValues?.durationMinutes} {...units} />
          {showSpeed ? <MeasurementField name="speed" defaultValue={defaultValues?.speed} {...units} /> : null}
          {showResistance ? <MeasurementField name="resistance" defaultValue={defaultValues?.resistance} {...units} /> : null}
        </div>
      ) : null}

      {
        // Not filtered by cardioFields - how long to rest applies to
        // strength and cardio alike.
      }
      <MeasurementField name="restSeconds" defaultValue={defaultValues?.restSeconds} {...units} />
    </>
  );
}

export { TargetFields };
