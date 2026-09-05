import { PlusIcon } from 'lucide-react';
import { useState } from 'react';
import { useFetcher } from 'react-router';

import { ExerciseHistoryButton } from '~/components/session/exercise-history-button';
import { Field } from '~/components/ui/field';
import { Input } from '~/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/components/ui/select';
import { SubmitButton } from '~/components/ui/submit-button';
import type { CardioFields } from '~/domain/equipment/cardio-fields';
import type { ExerciseType } from '~/domain/exercise/exercise-type';
import type { DistanceUnit, WeightUnit } from '~/domain/values/units';
import { speedUnitLabel } from '~/domain/values/units';
import type { Intent } from '~/lib/intent';
import { cn } from '~/lib/utils';

/**
 * The minimum an exercise has to offer for the log form to render the right
 * fields for it. Both the plan's items and the full library satisfy it.
 */
export type LoggableExercise = {
  id: string;
  name: string;
  exerciseType: ExerciseType;
  cardioFields: CardioFields;
};

function LogSetForm({
  logSet,
  exercise,
  exerciseOptions,
  date,
  todayStr,
  weightUnit,
  distanceUnit,
}: {
  logSet: Intent<object>;
  exercise?: LoggableExercise;
  exerciseOptions?: LoggableExercise[];
  date: string;
  todayStr: string;
  weightUnit: WeightUnit;
  distanceUnit: DistanceUnit;
}) {
  const fetcher = useFetcher();
  const [selectedId, setSelectedId] = useState(exercise?.id ?? '');
  const active = exercise ?? exerciseOptions?.find((e) => e.id === selectedId);
  const pending = fetcher.state !== 'idle';
  const error = fetcher.data && 'error' in fetcher.data ? fetcher.data.error : null;
  const { showSpeed, showResistance } = active?.cardioFields ?? { showSpeed: true, showResistance: true };

  return (
    <fetcher.Form method="post" className="flex flex-col gap-3">
      <input {...logSet.field} />
      <input type="hidden" name="date" value={date} />
      {exercise ? (
        <input type="hidden" name="exerciseId" value={exercise.id} />
      ) : (
        <Field
          label="Exercise"
          className="sm:max-w-xs"
          action={
            active ? <ExerciseHistoryButton exerciseId={active.id} exerciseName={active.name} todayStr={todayStr} /> : null
          }
        >
          {({ id }) => (
            <Select name="exerciseId" value={selectedId} onValueChange={setSelectedId}>
              <SelectTrigger id={id} className="w-full">
                <SelectValue placeholder="Choose an exercise" />
              </SelectTrigger>
              <SelectContent>
                {exerciseOptions?.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </Field>
      )}

      {active?.exerciseType === 'strength' ? (
        <div className="grid grid-cols-2 gap-3 sm:max-w-xs">
          <Field label="Reps">
            <Input name="reps" type="number" min={1} inputMode="numeric" placeholder="reps" />
          </Field>
          <Field label={`Weight (${weightUnit})`}>
            <Input name="weight" type="number" min={0} step="0.5" inputMode="decimal" placeholder={weightUnit} />
          </Field>
        </div>
      ) : null}

      {active?.exerciseType === 'cardio' ? (
        <div
          className={cn(
            'grid grid-cols-2 gap-3 sm:max-w-md',
            showSpeed && showResistance ? 'sm:grid-cols-3' : 'sm:grid-cols-2',
          )}
        >
          <Field label="Minutes">
            <Input name="durationMinutes" type="number" min={1} inputMode="numeric" placeholder="min" />
          </Field>
          {showSpeed ? (
            <Field label={`Speed (${speedUnitLabel(distanceUnit)})`}>
              <Input
                name="speed"
                type="number"
                min={0}
                step="0.1"
                inputMode="decimal"
                placeholder={speedUnitLabel(distanceUnit)}
              />
            </Field>
          ) : null}
          {showResistance ? (
            <Field label="Resistance">
              <Input name="resistance" type="number" min={1} inputMode="numeric" placeholder="level" />
            </Field>
          ) : null}
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="text-sm font-medium text-destructive">
          {error}
        </p>
      ) : null}

      <SubmitButton
        pending={pending}
        pendingLabel="Logging set"
        disabled={!active}
        size="sm"
        variant="brand"
        className="self-start"
      >
        {pending ? null : <PlusIcon aria-hidden="true" />}
        Log set
      </SubmitButton>
    </fetcher.Form>
  );
}

export { LogSetForm };
