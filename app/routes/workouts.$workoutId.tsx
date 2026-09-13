import { useMemo, useRef, useState } from 'react';

import { Form } from 'react-router';

import { Expose, Transform } from 'class-transformer';
import { IsIn, IsInt, IsNumber, IsOptional, IsPositive, IsUUID } from 'class-validator';
import { ChevronRightIcon, ListPlusIcon, PlusIcon, TrendingUpIcon } from 'lucide-react';

import { requireAthlete } from '~/auth/user-context';
import { BuilderFrame } from '~/components/builder/builder-frame';
import { BuilderOutline, BuilderOutlineItem } from '~/components/builder/builder-outline';
import { BuilderPalette, BuilderPaletteSearch } from '~/components/builder/builder-palette';
import { BuilderRow } from '~/components/builder/builder-row';
import { RowMoveButtons, RowRemoveMenu } from '~/components/builder/row-controls';
import { TargetFields } from '~/components/builder/target-fields';
import { useCloseOnSubmit } from '~/components/builder/use-close-on-submit';
import { NewExerciseDialog } from '~/components/exercises/new-exercise-dialog';
import { CustomizedNote, ForkableActions, OwnershipBadge } from '~/components/forkable-header';
import { Page, PageHeader } from '~/components/layout/page';
import { TargetChips } from '~/components/target-chips';
import { Button } from '~/components/ui/button';
import { EmptyState } from '~/components/ui/empty-state';
import { FacetFilter, type FacetOption } from '~/components/ui/facet-filter';
import { SubmitButton } from '~/components/ui/submit-button';
import { type ForkableDetail, forkableDetail } from '~/lib/forkable-detail';
import { forkableHandlers } from '~/lib/forkable-detail.server';
import { intent } from '~/lib/intent';
import { dispatch, handled } from '~/lib/intent.server';
import { requestLogger } from '~/lib/logger';
import { toOptionalNumber } from '~/lib/validate-form';
import { exerciseLibraryServiceContext, workoutServiceContext } from '~/router/load-context';
import type { ExerciseView } from '~application/use-cases/exercise-library-service';
import type { SuggestionView, WorkoutExerciseView } from '~application/use-cases/workout-service';
import type { CardioFields } from '~domain/equipment/cardio-fields';
import { EXERCISE_TYPES, type ExerciseType } from '~domain/exercise/exercise-type';

import type { Route } from './+types/workouts.$workoutId';

export function meta({ loaderData }: Route.MetaArgs) {
  return [{ title: `${loaderData?.workout.name ?? 'Workout'} - Apex Gains` }];
}

export const handle = {
  crumb: (data: Awaited<ReturnType<typeof loader>>) => [{ label: 'Workouts', to: '/workouts' }, { label: data.workout.name }],
};

export async function loader({ params, context }: Route.LoaderArgs) {
  const athlete = requireAthlete(context);
  const workoutService = context.get(workoutServiceContext);
  const workout = await workoutService.detail(athlete, params.workoutId);
  if (!workout) page.notFound();

  const libraryService = context.get(exerciseLibraryServiceContext);
  return {
    workout,
    // Array, not the service's Map - loader data serializes like any other
    // return value, and every other id-keyed lookup on this page is
    // rebuilt into a Map client-side from an array the same way.
    suggestions: [...(await workoutService.suggestions(athlete, params.workoutId)).values()],
    exercises: await libraryService.listExercises(athlete),
    weightUnit: athlete.preferences.weightUnit,
    distanceUnit: athlete.preferences.distanceUnit,
  };
}

class AddExerciseDto {
  @Expose()
  @IsUUID()
  readonly exerciseId!: string;
}

class WorkoutExerciseIdDto {
  @Expose()
  @IsUUID()
  readonly workoutExerciseId!: string;
}

class MoveExerciseDto extends WorkoutExerciseIdDto {
  @Expose()
  @IsIn(['up', 'down'])
  readonly direction!: 'up' | 'down';
}

class UpdateTargetDto extends WorkoutExerciseIdDto {
  @Expose()
  @Transform(toOptionalNumber())
  @IsOptional()
  @IsInt()
  @IsPositive()
  readonly targetSets?: number;

  @Expose()
  @Transform(toOptionalNumber())
  @IsOptional()
  @IsInt()
  @IsPositive()
  readonly targetReps?: number;

  @Expose()
  @Transform(toOptionalNumber())
  @IsOptional()
  @IsNumber()
  @IsPositive()
  readonly targetWeight?: number;

  @Expose()
  @Transform(toOptionalNumber())
  @IsOptional()
  @IsNumber()
  @IsPositive()
  readonly targetDurationMinutes?: number;

  @Expose()
  @Transform(toOptionalNumber())
  @IsOptional()
  @IsNumber()
  @IsPositive()
  readonly targetSpeed?: number;

  @Expose()
  @Transform(toOptionalNumber())
  @IsOptional()
  @IsInt()
  @IsPositive()
  readonly targetResistance?: number;

  @Expose()
  @Transform(toOptionalNumber())
  @IsOptional()
  @IsInt()
  @IsPositive()
  readonly targetRestSeconds?: number;
}

// Annotated so `notFound()`'s `never` narrows at the call site: TypeScript
// only applies that to a dotted name whose type is declared, not inferred.
const page: ForkableDetail = forkableDetail({
  noun: 'Workout',
  indexPath: '/workouts',
  pathFor: (id) => `/workouts/${id}`,
});
const { settle } = page;

const intents = {
  ...page.intents,
  addExercise: intent('addExercise', AddExerciseDto, { invalidMessage: 'Invalid exercise' }),
  removeExercise: intent('removeExercise', WorkoutExerciseIdDto),
  move: intent('move', MoveExerciseDto),
  updateTarget: intent('updateTarget', UpdateTargetDto, { invalidMessage: 'Invalid target' }),
  // Same DTO as updateTarget - applying a suggestion posts back the exact
  // target it showed, so it validates identically. Kept as its own named
  // intent so an Apply pending state never crosses with a Save target one.
  applySuggestion: intent('applySuggestion', UpdateTargetDto, { invalidMessage: 'Invalid target' }),
};

export async function action({ request, params, context }: Route.ActionArgs) {
  const athlete = requireAthlete(context);
  const workoutId = params.workoutId;
  const workoutService = context.get(workoutServiceContext);

  /**
   * updateTarget and applySuggestion post the identical shape - a manual edit and applying a suggestion are the same write.
   */
  const saveTarget = async (input: UpdateTargetDto) =>
    settle(
      await workoutService.updateExerciseTarget(athlete, workoutId, input.workoutExerciseId, {
        sets: input.targetSets,
        reps: input.targetReps,
        weight: input.targetWeight,
        durationMinutes: input.targetDurationMinutes,
        speed: input.targetSpeed,
        resistance: input.targetResistance,
        restSeconds: input.targetRestSeconds,
      }),
    );

  return dispatch(request, [
    ...forkableHandlers(page, workoutService, {
      athlete,
      id: workoutId,
      log: (message) => requestLogger(context).log(message, 'Workouts'),
    }),

    handled(intents.addExercise, async ({ exerciseId }) => {
      const outcome = await workoutService.addExercise(athlete, workoutId, exerciseId, {});
      if (!outcome.ok && outcome.error === 'exercise-not-found') {
        return intents.addExercise.reject('Exercise not found');
      }
      return settle(outcome);
    }),

    handled(intents.removeExercise, async ({ workoutExerciseId }) =>
      settle(await workoutService.removeExercise(athlete, workoutId, workoutExerciseId)),
    ),
    handled(intents.move, async ({ workoutExerciseId, direction }) =>
      settle(await workoutService.moveExercise(athlete, workoutId, workoutExerciseId, direction)),
    ),

    handled(intents.updateTarget, saveTarget),
    handled(intents.applySuggestion, saveTarget),
  ]);
}

function EditTargetDetail({
  entry,
  exerciseType,
  cardioFields,
  weightUnit,
  distanceUnit,
  error,
}: {
  entry: WorkoutExerciseView;
  exerciseType: ExerciseType;
  cardioFields: CardioFields;
  weightUnit: Route.ComponentProps['loaderData']['weightUnit'];
  distanceUnit: Route.ComponentProps['loaderData']['distanceUnit'];
  error?: string;
}) {
  const detailsRef = useRef<HTMLDetailsElement>(null);
  useCloseOnSubmit(() => {
    if (detailsRef.current) detailsRef.current.open = false;
  });

  return (
    <details ref={detailsRef}>
      <summary
        role="button"
        className="flex cursor-pointer items-center gap-1 text-sm font-medium text-muted-foreground select-none [&::-webkit-details-marker]:hidden [details[open]_&]:text-foreground"
      >
        <ChevronRightIcon
          className="size-3.5 transition-transform duration-(--dur-fast) [details[open]_&]:rotate-90"
          aria-hidden="true"
        />
        Edit target
      </summary>
      <Form method="post" className="mt-3 flex flex-col gap-3" key={JSON.stringify(entry.target)}>
        <input {...intents.updateTarget.field} />
        <input type="hidden" name="workoutExerciseId" value={entry.id} />
        <TargetFields
          exerciseType={exerciseType}
          cardioFields={cardioFields}
          weightUnit={weightUnit}
          distanceUnit={distanceUnit}
          defaultValues={{
            sets: entry.target?.sets ?? null,
            reps: entry.target?.reps ?? null,
            weight: entry.target?.weightValue ?? null,
            durationMinutes: entry.target?.durationMinutesValue ?? null,
            speed: entry.target?.speedValue ?? null,
            resistance: entry.target?.resistance ?? null,
            restSeconds: entry.target?.restSeconds ?? null,
          }}
        />
        {error ? <p className="text-sm font-medium text-destructive">{error}</p> : null}
        <SubmitButton size="sm" match={intents.updateTarget.match} pendingLabel="Saving" className="self-start">
          Save target
        </SubmitButton>
      </Form>
    </details>
  );
}

/**
 * "Suggested: 3 x 8 at 45 lb — you hit 3 x 10 twice", with an Apply that
 * posts the suggestion's own target back through `updateExerciseTarget` -
 * never applied on its own, only proposed.
 */
function TargetSuggestion({ suggestion }: { suggestion: SuggestionView }) {
  const { target } = suggestion;

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <span className="inline-flex items-center gap-1 text-sm text-muted-foreground">
        <TrendingUpIcon className="size-3.5 shrink-0" aria-hidden="true" />
        Suggested: <span className="font-medium text-foreground">{suggestion.summary}</span> — {suggestion.because}
      </span>
      <Form method="post">
        <input {...intents.applySuggestion.field} />
        <input type="hidden" name="workoutExerciseId" value={suggestion.workoutExerciseId} />
        <input type="hidden" name="targetSets" value={target.sets ?? ''} />
        <input type="hidden" name="targetReps" value={target.reps ?? ''} />
        <input type="hidden" name="targetWeight" value={target.weightValue ?? ''} />
        <input type="hidden" name="targetDurationMinutes" value={target.durationMinutesValue ?? ''} />
        <input type="hidden" name="targetSpeed" value={target.speedValue ?? ''} />
        <input type="hidden" name="targetResistance" value={target.resistance ?? ''} />
        <input type="hidden" name="targetRestSeconds" value={target.restSeconds ?? ''} />
        <SubmitButton size="sm" variant="outline" match={intents.applySuggestion.match} pendingLabel="Applying">
          Apply
        </SubmitButton>
      </Form>
    </div>
  );
}

function PaletteExerciseRow({ exercise, disabled }: { exercise: ExerciseView; disabled: boolean }) {
  return (
    <Form method="post">
      <input {...intents.addExercise.field} />
      <input type="hidden" name="exerciseId" value={exercise.id} />
      <button
        type="submit"
        disabled={disabled}
        className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition-colors duration-(--dur-fast) hover:bg-muted disabled:pointer-events-none disabled:opacity-50"
      >
        <span className="min-w-0 flex-1 truncate">{exercise.name}</span>
        <PlusIcon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
      </button>
    </Form>
  );
}

function ExercisePalette({
  exerciseList,
  usedExerciseIds,
}: {
  exerciseList: ExerciseView[];
  usedExerciseIds: ReadonlySet<string>;
}) {
  const [query, setQuery] = useState('');
  const [types, setTypes] = useState<Set<string>>(new Set());
  const [equipmentIds, setEquipmentIds] = useState<Set<string>>(new Set());

  const needle = query.trim().toLowerCase();
  const visible = useMemo(
    () =>
      exerciseList.filter((exercise) => {
        if (types.size > 0 && !types.has(exercise.exerciseType)) return false;
        if (equipmentIds.size > 0 && !exercise.equipment.some((item) => equipmentIds.has(item.id))) return false;
        if (needle === '') return true;
        return exercise.name.toLowerCase().includes(needle);
      }),
    [exerciseList, types, equipmentIds, needle],
  );

  const typeOptions: FacetOption[] = EXERCISE_TYPES.map((value) => ({
    value,
    label: value === 'strength' ? 'Strength' : 'Cardio',
    count: exerciseList.filter((e) => e.exerciseType === value).length,
  }));

  const equipmentById = new Map<string, { name: string; count: number }>();
  for (const exercise of exerciseList) {
    for (const item of exercise.equipment) {
      const current = equipmentById.get(item.id);
      equipmentById.set(item.id, { name: item.name, count: (current?.count ?? 0) + 1 });
    }
  }
  const equipmentOptions: FacetOption[] = [...equipmentById.entries()].map(([value, { name, count }]) => ({
    value,
    label: name,
    count,
  }));

  return (
    <BuilderPalette
      items={visible}
      getKey={(exercise) => exercise.id}
      emptyLabel="No exercises match"
      filters={
        <div className="flex flex-col gap-2">
          <BuilderPaletteSearch value={query} onChange={setQuery} placeholder="Search exercises…" />
          <div className="flex flex-wrap gap-1.5">
            <FacetFilter label="Type" options={typeOptions} selected={types} onChange={setTypes} />
            {equipmentOptions.length > 0 ? (
              <FacetFilter label="Equipment" options={equipmentOptions} selected={equipmentIds} onChange={setEquipmentIds} />
            ) : null}
          </div>
        </div>
      }
      renderItem={(exercise) => <PaletteExerciseRow exercise={exercise} disabled={usedExerciseIds.has(exercise.id)} />}
      newAction={
        <NewExerciseDialog
          trigger={
            <Button variant="outline" size="sm" className="w-full">
              <PlusIcon aria-hidden="true" />
              New exercise
            </Button>
          }
        />
      }
    />
  );
}

export default function WorkoutDetail({ loaderData, actionData }: Route.ComponentProps) {
  const { workout, suggestions, exercises: exerciseList, weightUnit, distanceUnit } = loaderData;

  const exerciseCount = workout.exercises.length;
  const { isSample, isCustomized } = workout;
  const usedExerciseIds = new Set(workout.exercises.map((entry) => entry.exerciseId));
  const suggestionByEntryId = new Map(suggestions.map((suggestion) => [suggestion.workoutExerciseId, suggestion]));

  const updateTargetError = intents.updateTarget.errorIn(actionData);

  const palette = <ExercisePalette exerciseList={exerciseList} usedExerciseIds={usedExerciseIds} />;

  return (
    <Page width="full">
      <PageHeader
        title={workout.name}
        badge={<OwnershipBadge isSample={isSample} isCustomized={isCustomized} />}
        description={`${exerciseCount} exercise${exerciseCount === 1 ? '' : 's'} in this workout.`}
        actions={
          <ForkableActions
            page={page}
            name={workout.name}
            isSample={isSample}
            isCustomized={isCustomized}
            actionData={actionData}
          />
        }
      />

      <CustomizedNote page={page} isCustomized={isCustomized} />

      <div className="mt-(--section-gap)">
        <BuilderFrame
          addLabel="Add exercise"
          addTitle="Add an exercise"
          palette={palette}
          outline={
            exerciseCount > 0 ? (
              <BuilderOutline>
                {workout.exercises.map((entry, index) => (
                  <BuilderOutlineItem key={entry.id} position={index + 1} label={entry.exerciseName} />
                ))}
              </BuilderOutline>
            ) : null
          }
          rows={workout.exercises.map((entry, index) => {
            const suggestion = suggestionByEntryId.get(entry.id);
            const row = { id: entry.id, idField: 'workoutExerciseId', label: entry.exerciseName };
            return (
              <BuilderRow
                key={entry.id}
                position={index + 1}
                title={entry.exerciseName}
                chips={<TargetChips target={entry.target} />}
                note={suggestion ? <TargetSuggestion suggestion={suggestion} /> : undefined}
                controls={<RowMoveButtons move={intents.move} {...row} index={index} count={exerciseCount} />}
                menu={<RowRemoveMenu remove={intents.removeExercise} {...row} />}
                detail={
                  <EditTargetDetail
                    entry={entry}
                    exerciseType={entry.exerciseType}
                    cardioFields={entry.cardioFields}
                    weightUnit={weightUnit}
                    distanceUnit={distanceUnit}
                    error={updateTargetError}
                  />
                }
              />
            );
          })}
          empty={
            <EmptyState
              icon={ListPlusIcon}
              title="No exercises yet"
              description="Add the first movement from the palette."
              compact
            />
          }
        />
      </div>
    </Page>
  );
}
