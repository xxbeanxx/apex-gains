import type { CardioFields } from '~/domain/equipment/cardio-fields';
import type { ExerciseType } from '~/domain/exercise/exercise-type';
import type { DistanceUnit, WeightUnit } from '~/domain/values/units';
import { speedUnitLabel } from '~/domain/values/units';
import { Field } from '~/components/ui/field';
import { Input } from '~/components/ui/input';
import { cn } from '~/lib/utils';

export type TargetFieldsValues = {
  sets: number | null;
  reps: number | null;
  weight: number | null;
  durationMinutes: number | null;
  speed: number | null;
  resistance: number | null;
};

/**
 * The target inputs a strength or cardio exercise takes, named to match
 * `TargetInput` on the wire. Which of the two shows - and which cardio
 * fields within it - is decided once by the exercise's type and its
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
  defaultValues?: Partial<TargetFieldsValues>;
}) {
  const { showSpeed, showResistance } = cardioFields;

  return (
    <>
      {exerciseType === 'strength' ? (
        <div className="grid grid-cols-3 gap-3">
          <Field label="Sets">
            <Input
              name="targetSets"
              type="number"
              min={1}
              inputMode="numeric"
              placeholder="sets"
              defaultValue={defaultValues?.sets ?? undefined}
            />
          </Field>
          <Field label="Reps">
            <Input
              name="targetReps"
              type="number"
              min={1}
              inputMode="numeric"
              placeholder="reps"
              defaultValue={defaultValues?.reps ?? undefined}
            />
          </Field>
          <Field label={`Weight (${weightUnit})`}>
            <Input
              name="targetWeight"
              type="number"
              min={0}
              step="0.5"
              inputMode="decimal"
              placeholder={weightUnit}
              defaultValue={defaultValues?.weight ?? undefined}
            />
          </Field>
        </div>
      ) : null}

      {exerciseType === 'cardio' ? (
        <div className={cn('grid gap-3', showSpeed && showResistance ? 'grid-cols-3' : 'grid-cols-2')}>
          <Field label="Minutes">
            <Input
              name="targetDurationMinutes"
              type="number"
              min={1}
              inputMode="numeric"
              placeholder="min"
              defaultValue={defaultValues?.durationMinutes ?? undefined}
            />
          </Field>
          {showSpeed ? (
            <Field label={`Speed (${speedUnitLabel(distanceUnit)})`}>
              <Input
                name="targetSpeed"
                type="number"
                min={0}
                step="0.1"
                inputMode="decimal"
                placeholder={speedUnitLabel(distanceUnit)}
                defaultValue={defaultValues?.speed ?? undefined}
              />
            </Field>
          ) : null}
          {showResistance ? (
            <Field label="Resistance">
              <Input
                name="targetResistance"
                type="number"
                min={1}
                inputMode="numeric"
                placeholder="level"
                defaultValue={defaultValues?.resistance ?? undefined}
              />
            </Field>
          ) : null}
        </div>
      ) : null}
    </>
  );
}

export { TargetFields };
