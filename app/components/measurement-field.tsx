import { Field } from '~/components/ui/field';
import { Input } from '~/components/ui/input';
import type { MeasurementName, MeasurementValues } from '~application/shared/measurement-values';
import { type DistanceUnit, type WeightUnit, speedUnitLabel } from '~domain/values/units';

type Units = { weightUnit: WeightUnit; distanceUnit: DistanceUnit };

/**
 * How each measurement is typed in: its label, its placeholder, and the
 * number input's constraints. Stated once, so the target form and the
 * logging form cannot label or bound the same measurement differently.
 */
const SPECS: Record<
  MeasurementName,
  (units: Units) => { label: string; placeholder: string; min: number; step?: string; inputMode: 'numeric' | 'decimal' }
> = {
  sets: () => ({ label: 'Sets', placeholder: 'sets', min: 1, inputMode: 'numeric' }),
  reps: () => ({ label: 'Reps', placeholder: 'reps', min: 1, inputMode: 'numeric' }),
  weight: ({ weightUnit }) => ({
    label: `Weight (${weightUnit})`,
    placeholder: weightUnit,
    min: 0,
    step: '0.5',
    inputMode: 'decimal',
  }),
  durationMinutes: () => ({ label: 'Minutes', placeholder: 'min', min: 1, inputMode: 'numeric' }),
  speed: ({ distanceUnit }) => ({
    label: `Speed (${speedUnitLabel(distanceUnit)})`,
    placeholder: speedUnitLabel(distanceUnit),
    min: 0,
    step: '0.1',
    inputMode: 'decimal',
  }),
  resistance: () => ({ label: 'Resistance', placeholder: 'level', min: 1, inputMode: 'numeric' }),
  restSeconds: () => ({ label: 'Rest (seconds)', placeholder: 'off', min: 1, inputMode: 'numeric' }),
};

/**
 * One measurement's labelled number input, posting under `name` - the name
 * `MeasurementFieldsDto` validates and the use case reads.
 */
function MeasurementField({
  name,
  defaultValue,
  ...units
}: Units & {
  name: MeasurementName;
  defaultValue?: number | null;
}) {
  const { label, ...input } = SPECS[name](units);

  return (
    <Field label={label}>
      <Input name={name} type="number" defaultValue={defaultValue ?? undefined} {...input} />
    </Field>
  );
}

/**
 * Every measurement as a hidden input, for a form that posts values it
 * already has rather than asking for them - applying a suggested target.
 */
function MeasurementHiddenFields({ values }: { values: MeasurementValues }) {
  return (
    <>
      {(Object.keys(SPECS) as MeasurementName[]).map((name) => (
        <input key={name} type="hidden" name={name} value={values[name] ?? ''} />
      ))}
    </>
  );
}

export { MeasurementField, MeasurementHiddenFields };
