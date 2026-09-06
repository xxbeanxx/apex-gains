import { Expose, Transform } from 'class-transformer';
import { IsIn, IsInt, IsNumber, IsOptional, IsPositive, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import {
  ArrowDownIcon,
  ArrowUpIcon,
  ChevronRightIcon,
  EllipsisIcon,
  ListPlusIcon,
  PlusIcon,
  TrendingUpIcon,
  XIcon,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { useSubmit } from 'react-router';

import { requireAthlete } from '~/auth/user-context';
import { BuilderCanvas } from '~/components/builder/builder-canvas';
import { BuilderLayout } from '~/components/builder/builder-layout';
import { BuilderOutline, BuilderOutlineItem } from '~/components/builder/builder-outline';
import { BuilderPalette, BuilderPaletteSearch } from '~/components/builder/builder-palette';
import { BuilderRow } from '~/components/builder/builder-row';
import { RenameDisclosure } from '~/components/builder/rename-disclosure';
import { TargetFields } from '~/components/builder/target-fields';
import { NewExerciseDialog } from '~/components/exercises/new-exercise-dialog';
import { OwnershipBadge, RevertOrDeleteForm } from '~/components/forkable-header';
import { Page, PageHeader } from '~/components/layout/page';
import { TargetChips } from '~/components/target-chips';
import { Button } from '~/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '~/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '~/components/ui/dropdown-menu';
import { EmptyState } from '~/components/ui/empty-state';
import { Field } from '~/components/ui/field';
import { FacetFilter, type FacetOption } from '~/components/ui/facet-filter';
import { Input } from '~/components/ui/input';
import { SubmitButton } from '~/components/ui/submit-button';
import type { CardioFields } from '~/domain/equipment/cardio-fields';
import { EXERCISE_TYPES, type ExerciseType } from '~/domain/exercise/exercise-type';
import { requestLogger } from '~/lib/logger.server';
import { intent } from '~/lib/intent';
import { forkableDetail, type ForkableDetail } from '~/lib/forkable-detail.server';
import { dispatch, handled } from '~/lib/intent.server';
import { toOptionalNumber, trim } from '~/lib/validate-form';
import type { ExerciseView } from '~/services/exercise-library-service.server';
import type { SuggestionView, WorkoutExerciseView } from '~/services/workout-service.server';

import { exerciseLibraryServiceContext, workoutServiceContext } from '~/lib/nest-bridge.server';

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

class RenameWorkoutDto {
  @Expose()
  @Transform(trim())
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  readonly name!: string;
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
  delete: intent('delete'),
  revert: intent('revert'),
  rename: intent('rename', RenameWorkoutDto, { invalidMessage: 'Invalid name' }),
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

  /** updateTarget and applySuggestion post the identical shape - a manual edit and applying a suggestion are the same write. */
  const saveTarget = async (input: UpdateTargetDto) =>
    settle(
      await workoutService.updateExerciseTarget(athlete, workoutId, input.workoutExerciseId, {
        sets: input.targetSets,
        reps: input.targetReps,
        weight: input.targetWeight,
        durationMinutes: input.targetDurationMinutes,
        speed: input.targetSpeed,
        resistance: input.targetResistance,
      }),
    );

  return dispatch(request, [
    handled(intents.delete, async () =>
      page.deleted(intents.delete, await workoutService.remove(athlete, workoutId), () =>
        requestLogger(context).log(`deleted workout ${workoutId} for user ${athlete.id}`, 'Workouts'),
      ),
    ),

    handled(intents.revert, async () => page.reverted(intents.revert, await workoutService.revert(athlete, workoutId))),

    handled(intents.rename, async ({ name }) => settle(await workoutService.rename(athlete, workoutId, name))),

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

function MoveButtons({ entry, index, count }: { entry: WorkoutExerciseView; index: number; count: number }) {
  return (
    <>
      <form method="post">
        <input {...intents.move.field} />
        <input type="hidden" name="workoutExerciseId" value={entry.id} />
        <input type="hidden" name="direction" value="up" />
        <Button type="submit" variant="ghost" size="icon-sm" disabled={index === 0}>
          <ArrowUpIcon aria-hidden="true" />
          <span className="sr-only">Move {entry.exerciseName} up</span>
        </Button>
      </form>
      <form method="post">
        <input {...intents.move.field} />
        <input type="hidden" name="workoutExerciseId" value={entry.id} />
        <input type="hidden" name="direction" value="down" />
        <Button type="submit" variant="ghost" size="icon-sm" disabled={index === count - 1}>
          <ArrowDownIcon aria-hidden="true" />
          <span className="sr-only">Move {entry.exerciseName} down</span>
        </Button>
      </form>
    </>
  );
}

/** The `⋯` menu's one action: removing the entry. A plain navigation submit, same request cycle a literal form's own submit would make. */
function RowMenu({ entry }: { entry: WorkoutExerciseView }) {
  const submit = useSubmit();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${entry.exerciseName}`}>
          <EllipsisIcon aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          variant="destructive"
          onSelect={() => submit({ intent: intents.removeExercise.name, workoutExerciseId: entry.id }, { method: 'post' })}
        >
          <XIcon aria-hidden="true" />
          Remove
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
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
  return (
    <details>
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
      <form method="post" className="mt-3 flex flex-col gap-3">
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
          }}
        />
        {error ? <p className="text-sm font-medium text-destructive">{error}</p> : null}
        <SubmitButton size="sm" match={intents.updateTarget.match} pendingLabel="Saving" className="self-start">
          Save target
        </SubmitButton>
      </form>
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
      <form method="post">
        <input {...intents.applySuggestion.field} />
        <input type="hidden" name="workoutExerciseId" value={suggestion.workoutExerciseId} />
        <input type="hidden" name="targetSets" value={target.sets ?? ''} />
        <input type="hidden" name="targetReps" value={target.reps ?? ''} />
        <input type="hidden" name="targetWeight" value={target.weightValue ?? ''} />
        <input type="hidden" name="targetDurationMinutes" value={target.durationMinutesValue ?? ''} />
        <input type="hidden" name="targetSpeed" value={target.speedValue ?? ''} />
        <input type="hidden" name="targetResistance" value={target.resistance ?? ''} />
        <SubmitButton size="sm" variant="outline" match={intents.applySuggestion.match} pendingLabel="Applying">
          Apply
        </SubmitButton>
      </form>
    </div>
  );
}

function PaletteExerciseRow({ exercise, disabled }: { exercise: ExerciseView; disabled: boolean }) {
  return (
    <form method="post">
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
    </form>
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
  const exerciseById = new Map(exerciseList.map((exercise) => [exercise.id, exercise]));
  const suggestionByEntryId = new Map(suggestions.map((suggestion) => [suggestion.workoutExerciseId, suggestion]));
  const defaultCardioFields: CardioFields = { showSpeed: true, showResistance: true };

  const renameError = intents.rename.errorIn(actionData);
  const updateTargetError = intents.updateTarget.errorIn(actionData);
  const [mobilePaletteOpen, setMobilePaletteOpen] = useState(false);

  const palette = <ExercisePalette exerciseList={exerciseList} usedExerciseIds={usedExerciseIds} />;

  return (
    <Page width="full">
      <PageHeader
        title={workout.name}
        badge={<OwnershipBadge isSample={isSample} isCustomized={isCustomized} />}
        description={`${exerciseCount} exercise${exerciseCount === 1 ? '' : 's'} in this workout.`}
        actions={
          <div className="flex items-center gap-1.5">
            <RenameDisclosure>
              <form method="post">
                <input {...intents.rename.field} />
                <Field
                  label="Name"
                  error={renameError}
                  action={
                    <SubmitButton size="sm" match={intents.rename.match} pendingLabel="Saving">
                      Save
                    </SubmitButton>
                  }
                >
                  <Input name="name" defaultValue={workout.name} required />
                </Field>
              </form>
            </RenameDisclosure>
            <RevertOrDeleteForm
              noun="workout"
              isSample={isSample}
              isCustomized={isCustomized}
              revert={intents.revert}
              remove={intents.delete}
              actionData={actionData}
            />
          </div>
        }
      />

      {isCustomized ? (
        <p className="mt-4 text-sm text-muted-foreground">
          This is your customized copy of a sample workout. The original sample is unaffected.
        </p>
      ) : null}

      <div className="mt-(--section-gap)">
        <Dialog open={mobilePaletteOpen} onOpenChange={setMobilePaletteOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" className="mb-4 w-full md:hidden">
              <PlusIcon aria-hidden="true" />
              Add exercise
            </Button>
          </DialogTrigger>
          <DialogContent className="p-0 sm:max-w-sm">
            <DialogHeader className="p-4 pb-0">
              <DialogTitle>Add an exercise</DialogTitle>
            </DialogHeader>
            <div className="p-4">{palette}</div>
          </DialogContent>
        </Dialog>

        <BuilderLayout
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
          canvas={
            exerciseCount === 0 ? (
              <EmptyState
                icon={ListPlusIcon}
                title="No exercises yet"
                description="Add the first movement from the palette."
                compact
              />
            ) : (
              <BuilderCanvas>
                {workout.exercises.map((entry, index) => {
                  const exercise = exerciseById.get(entry.exerciseId);
                  const suggestion = suggestionByEntryId.get(entry.id);
                  return (
                    <BuilderRow
                      key={entry.id}
                      position={index + 1}
                      title={entry.exerciseName}
                      chips={<TargetChips target={entry.target} />}
                      note={suggestion ? <TargetSuggestion suggestion={suggestion} /> : undefined}
                      controls={<MoveButtons entry={entry} index={index} count={exerciseCount} />}
                      menu={<RowMenu entry={entry} />}
                      detail={
                        <EditTargetDetail
                          entry={entry}
                          exerciseType={entry.exerciseType}
                          cardioFields={exercise?.cardioFields ?? defaultCardioFields}
                          weightUnit={weightUnit}
                          distanceUnit={distanceUnit}
                          error={updateTargetError}
                        />
                      }
                    />
                  );
                })}
              </BuilderCanvas>
            )
          }
        />
      </div>
    </Page>
  );
}
