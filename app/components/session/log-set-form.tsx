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
import { formatMonthDay } from '~/lib/format';
import { cn } from '~/lib/utils';
import type { LastSetView, LoggedSetView } from '~/services/session-service.server';

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
  loggedSets,
  lastSets,
}: {
  logSet: Intent<object>;
  exercise?: LoggableExercise;
  exerciseOptions?: LoggableExercise[];
  date: string;
  todayStr: string;
  weightUnit: WeightUnit;
  distanceUnit: DistanceUnit;
  /** Every set already logged this page's date - source of "same day" prefill. */
  loggedSets: LoggedSetView[];
  /** The previous session's set per exercise - source of the "Last time" hint and its fallback prefill. */
  lastSets: Record<string, LastSetView>;
}) {
  const fetcher = useFetcher();
  const [selectedId, setSelectedId] = useState(exercise?.id ?? '');
  const active = exercise ?? exerciseOptions?.find((e) => e.id === selectedId);
  const pending = fetcher.state !== 'idle';
  const error = fetcher.data && 'error' in fetcher.data ? fetcher.data.error : null;
  const { showSpeed, showResistance } = active?.cardioFields ?? { showSpeed: true, showResistance: true };

  const lastSet = active ? lastSets[active.id] : undefined;
  // The most recent set logged for this exercise today outranks "last time"
  // as a default: mid-session, it's what keeps set 3 close to set 2.
  const todaysLastSet = active ? loggedSets.filter((set) => set.exerciseId === active.id).at(-1) : undefined;
  const prefill = todaysLastSet ?? lastSet;
  // Uncontrolled inputs never reset on their own, so the key has to change
  // whenever the resolved prefill does - switching exercises, or a set just
  // logged today changing what "same day" now means - or a stale value from
  // one exercise (or date) would leak into the next.
  const fieldsKey = `${active?.id ?? 'none'}:${todaysLastSet?.id ?? lastSet?.date ?? 'none'}`;

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

      {lastSet ? (
        <p className="text-xs text-muted-foreground">
          Last time: {lastSet.summary} on {formatMonthDay(lastSet.date)}
        </p>
      ) : null}

      {active?.exerciseType === 'strength' ? (
        <div key={fieldsKey} className="grid grid-cols-2 gap-3 sm:max-w-xs">
          <Field label="Reps">
            <Input
              name="reps"
              type="number"
              min={1}
              inputMode="numeric"
              placeholder="reps"
              defaultValue={prefill?.reps ?? undefined}
            />
          </Field>
          <Field label={`Weight (${weightUnit})`}>
            <Input
              name="weight"
              type="number"
              min={0}
              step="0.5"
              inputMode="decimal"
              placeholder={weightUnit}
              defaultValue={prefill?.weight ?? undefined}
            />
          </Field>
        </div>
      ) : null}

      {active?.exerciseType === 'cardio' ? (
        <div
          key={fieldsKey}
          className={cn(
            'grid grid-cols-2 gap-3 sm:max-w-md',
            showSpeed && showResistance ? 'sm:grid-cols-3' : 'sm:grid-cols-2',
          )}
        >
          <Field label="Minutes">
            <Input
              name="durationMinutes"
              type="number"
              min={1}
              inputMode="numeric"
              placeholder="min"
              defaultValue={prefill?.durationMinutes ?? undefined}
            />
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
                defaultValue={prefill?.speed ?? undefined}
              />
            </Field>
          ) : null}
          {showResistance ? (
            <Field label="Resistance">
              <Input
                name="resistance"
                type="number"
                min={1}
                inputMode="numeric"
                placeholder="level"
                defaultValue={prefill?.resistance ?? undefined}
              />
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
