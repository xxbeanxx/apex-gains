import { Expose, Transform } from 'class-transformer';
import { IsIn, IsInt, IsNumber, IsOptional, IsPositive, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { ArrowDownIcon, ArrowUpIcon, ListPlusIcon, PlusIcon, RotateCcwIcon, Trash2Icon, XIcon } from 'lucide-react';
import { useState } from 'react';
import { data, redirect, useFetcher } from 'react-router';

import { requireAthlete } from '~/auth/user-context';
import { OwnershipBadge, RevertOrDeleteForm } from '~/components/forkable-header';
import { Page, PageHeader, Section } from '~/components/layout/page';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';
import { EmptyState } from '~/components/ui/empty-state';
import { Field } from '~/components/ui/field';
import { Input } from '~/components/ui/input';
import { SubmitButton } from '~/components/ui/submit-button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/components/ui/select';
import type { DistanceUnit, WeightUnit } from '~/domain/values/units';
import { speedUnitLabel } from '~/domain/values/units';
import { requestLogger } from '~/lib/logger.server';
import { cn } from '~/lib/utils';
import { intent } from '~/lib/intent';
import { forkableDetail, type ForkableDetail } from '~/lib/forkable-detail.server';
import { dispatch, handled } from '~/lib/intent.server';
import { toOptionalNumber, trim } from '~/lib/validate-form';
import type { ExerciseView } from '~/services/exercise-library-service.server';

import { exerciseLibraryServiceContext, workoutServiceContext } from '~/lib/nest-bridge.server';

import type { Route } from './+types/workouts.$workoutId';

export function meta({ loaderData }: Route.MetaArgs) {
  return [{ title: `${loaderData?.workout.name ?? 'Workout'} - Apex Gains` }];
}

export async function loader({ params, context }: Route.LoaderArgs) {
  const athlete = requireAthlete(context);
  const workoutService = context.get(workoutServiceContext);
  const workout = await workoutService.detail(athlete, params.workoutId);
  if (!workout) page.notFound();

  const libraryService = context.get(exerciseLibraryServiceContext);
  return {
    workout,
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
};

export async function action({ request, params, context }: Route.ActionArgs) {
  const athlete = requireAthlete(context);
  const workoutId = params.workoutId;
  const workoutService = context.get(workoutServiceContext);

  return dispatch(request, [
    handled(intents.delete, async () =>
      page.deleted(intents.delete, await workoutService.remove(athlete, workoutId), () =>
        requestLogger(context).log(`deleted workout ${workoutId} for user ${athlete.id}`, 'Workouts'),
      ),
    ),

    handled(intents.revert, async () => page.reverted(intents.revert, await workoutService.revert(athlete, workoutId))),

    handled(intents.rename, async ({ name }) => settle(await workoutService.rename(athlete, workoutId, name))),

    handled(intents.addExercise, async (input) => {
      // Targets are in the athlete's own units; the service converts them.
      const outcome = await workoutService.addExercise(athlete, workoutId, input.exerciseId, {
        sets: input.targetSets,
        reps: input.targetReps,
        weight: input.targetWeight,
        durationMinutes: input.targetDurationMinutes,
        speed: input.targetSpeed,
        resistance: input.targetResistance,
      });
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
  ]);
}

function AddExerciseForm({
  exerciseList,
  weightUnit,
  distanceUnit,
}: {
  exerciseList: ExerciseView[];
  weightUnit: WeightUnit;
  distanceUnit: DistanceUnit;
}) {
  const fetcher = useFetcher();
  const [exerciseId, setExerciseId] = useState<string>('');
  const selected = exerciseList.find((e) => e.id === exerciseId);
  const { showSpeed, showResistance } = selected?.cardioFields ?? { showSpeed: true, showResistance: true };

  const pending = fetcher.state !== 'idle';
  const error = fetcher.data && 'error' in fetcher.data ? fetcher.data.error : undefined;

  return (
    <fetcher.Form method="post" className="flex flex-col gap-4">
      <input {...intents.addExercise.field} />
      <Field label="Exercise">
        {({ id }) => (
          <Select name="exerciseId" value={exerciseId} onValueChange={setExerciseId}>
            <SelectTrigger id={id} className="w-full">
              <SelectValue placeholder="Choose an exercise" />
            </SelectTrigger>
            <SelectContent>
              {exerciseList.map((exercise) => (
                <SelectItem key={exercise.id} value={exercise.id}>
                  {exercise.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </Field>

      {selected?.exerciseType === 'strength' ? (
        <div className="grid grid-cols-3 gap-3">
          <Field label="Sets">
            <Input name="targetSets" type="number" min={1} inputMode="numeric" placeholder="sets" />
          </Field>
          <Field label="Reps">
            <Input name="targetReps" type="number" min={1} inputMode="numeric" placeholder="reps" />
          </Field>
          <Field label={`Weight (${weightUnit})`}>
            <Input name="targetWeight" type="number" min={0} step="0.5" inputMode="decimal" placeholder={weightUnit} />
          </Field>
        </div>
      ) : null}

      {selected?.exerciseType === 'cardio' ? (
        <div className={cn('grid gap-3', showSpeed && showResistance ? 'grid-cols-3' : 'grid-cols-2')}>
          <Field label="Minutes">
            <Input name="targetDurationMinutes" type="number" min={1} inputMode="numeric" placeholder="min" />
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
              />
            </Field>
          ) : null}
          {showResistance ? (
            <Field label="Resistance">
              <Input name="targetResistance" type="number" min={1} inputMode="numeric" placeholder="level" />
            </Field>
          ) : null}
        </div>
      ) : null}

      {error ? <p className="text-sm font-medium text-destructive">{error}</p> : null}

      <SubmitButton
        pending={pending}
        pendingLabel="Adding exercise"
        disabled={!exerciseId}
        variant="brand"
        className="self-start"
      >
        {pending ? null : <PlusIcon aria-hidden="true" />}
        Add exercise
      </SubmitButton>
    </fetcher.Form>
  );
}

export default function WorkoutDetail({ loaderData, actionData }: Route.ComponentProps) {
  const { workout, exercises: exerciseList, weightUnit, distanceUnit } = loaderData;

  const exerciseCount = workout.exercises.length;
  const { isSample, isCustomized } = workout;

  const renameError = intents.rename.errorIn(actionData);

  return (
    <Page width="narrow">
      <PageHeader
        title={workout.name}
        badge={<OwnershipBadge isSample={isSample} isCustomized={isCustomized} />}
        description={`${exerciseCount} exercise${exerciseCount === 1 ? '' : 's'} in this workout.`}
        actions={
          <RevertOrDeleteForm
            noun="workout"
            isSample={isSample}
            isCustomized={isCustomized}
            revert={intents.revert}
            remove={intents.delete}
            actionData={actionData}
          />
        }
      />

      {isCustomized ? (
        <p className="mt-(--section-gap) text-sm text-muted-foreground">
          This is your customized copy of a sample workout. The original sample is unaffected.
        </p>
      ) : null}

      <Card className="mt-(--section-gap) max-w-md">
        <CardHeader>
          <CardTitle>Rename</CardTitle>
          {isSample ? (
            <p className="text-sm text-muted-foreground">Renaming a sample workout creates your own customized copy.</p>
          ) : null}
        </CardHeader>
        <CardContent>
          <form method="post">
            <input {...intents.rename.field} />
            <Field
              label="Name"
              error={renameError}
              action={
                <SubmitButton match={intents.rename.match} pendingLabel="Saving">
                  Save
                </SubmitButton>
              }
            >
              <Input name="name" defaultValue={workout.name} required />
            </Field>
          </form>
        </CardContent>
      </Card>

      <Section
        title="Exercises"
        description="Targets pre-fill the logging form on the Today page; every field stays editable per set."
      >
        {exerciseCount === 0 ? (
          <EmptyState
            icon={ListPlusIcon}
            title="No exercises yet"
            description="Add the first movement using the form below."
            compact
          />
        ) : (
          <ol className="grid gap-3 lg:grid-cols-2">
            {workout.exercises.map((te, index) => (
              <li
                key={te.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-3 py-2.5 shadow-sm shadow-black/[0.03] transition-colors duration-(--dur) hover:border-ring/30 dark:shadow-black/20"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span
                    aria-hidden="true"
                    className="flex size-6 shrink-0 items-center justify-center rounded-md bg-muted text-xs font-semibold text-muted-foreground tabular-nums"
                  >
                    {index + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate font-medium">{te.exerciseName}</p>
                    <p className="truncate text-sm text-muted-foreground tabular-nums">{te.targetSummary ?? 'No target set'}</p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-0.5">
                  <form method="post">
                    <input {...intents.move.field} />
                    <input type="hidden" name="workoutExerciseId" value={te.id} />
                    <input type="hidden" name="direction" value="up" />
                    <Button type="submit" variant="ghost" size="icon-sm" disabled={index === 0}>
                      <ArrowUpIcon aria-hidden="true" />
                      <span className="sr-only">Move {te.exerciseName} up</span>
                    </Button>
                  </form>
                  <form method="post">
                    <input {...intents.move.field} />
                    <input type="hidden" name="workoutExerciseId" value={te.id} />
                    <input type="hidden" name="direction" value="down" />
                    <Button type="submit" variant="ghost" size="icon-sm" disabled={index === exerciseCount - 1}>
                      <ArrowDownIcon aria-hidden="true" />
                      <span className="sr-only">Move {te.exerciseName} down</span>
                    </Button>
                  </form>
                  <form method="post">
                    <input {...intents.removeExercise.field} />
                    <input type="hidden" name="workoutExerciseId" value={te.id} />
                    <Button
                      type="submit"
                      variant="ghost"
                      size="icon-sm"
                      className="hover:bg-destructive/10 hover:text-destructive"
                    >
                      <XIcon aria-hidden="true" />
                      <span className="sr-only">Remove {te.exerciseName} from this workout</span>
                    </Button>
                  </form>
                </div>
              </li>
            ))}
          </ol>
        )}

        <Card className="max-w-xl">
          <CardHeader>
            <CardTitle>Add an exercise</CardTitle>
          </CardHeader>
          <CardContent>
            <AddExerciseForm exerciseList={exerciseList} weightUnit={weightUnit} distanceUnit={distanceUnit} />
          </CardContent>
        </Card>
      </Section>
    </Page>
  );
}
