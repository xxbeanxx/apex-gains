import { Expose, Transform } from 'class-transformer';
import { IsIn, IsInt, IsNumber, IsOptional, IsPositive, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { ArrowDownIcon, ArrowUpIcon, ListPlusIcon, PlusIcon, RotateCcwIcon, Trash2Icon, XIcon } from 'lucide-react';
import { useState } from 'react';
import { data, redirect, useFetcher } from 'react-router';

import { userContext } from '~/auth/user-context';
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
import { cardioFieldsFor } from '~/lib/cardio-equipment';
import { requestLogger } from '~/lib/logger.server';
import { cn } from '~/lib/utils';
import { toOptionalNumber, trim, validateForm } from '~/lib/validate-form.server';
import type { ExerciseView } from '~/services/exercise-library-service.server';

import { exerciseLibraryServiceContext, templateServiceContext } from '~/lib/nest-bridge.server';

import type { Route } from './+types/templates.$templateId';

export function meta({ loaderData }: Route.MetaArgs) {
  return [{ title: `${loaderData?.template.name ?? 'Template'} - Apex Gains` }];
}

export async function loader({ params, context }: Route.LoaderArgs) {
  const athlete = context.get(userContext)!;
  const templateService = context.get(templateServiceContext);
  const template = await templateService.detail(athlete, params.templateId);
  if (!template) {
    throw data('Template not found', { status: 404 });
  }

  const libraryService = context.get(exerciseLibraryServiceContext);
  return {
    template,
    exercises: await libraryService.listExercises(athlete),
    weightUnit: athlete.preferences.weightUnit,
    distanceUnit: athlete.preferences.distanceUnit,
  };
}

class RenameTemplateDto {
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

class TemplateExerciseIdDto {
  @Expose()
  @IsUUID()
  readonly templateExerciseId!: string;
}

class MoveExerciseDto extends TemplateExerciseIdDto {
  @Expose()
  @IsIn(['up', 'down'])
  readonly direction!: 'up' | 'down';
}

/** See routines.$routineId.tsx's `settle` - same epilogue, same reasoning. */
function settle(outcome: { ok: true; value: { forkedId: string | null } } | { ok: false }) {
  if (!outcome.ok) {
    throw data('Template not found', { status: 404 });
  }
  if (outcome.value.forkedId) {
    throw redirect(`/templates/${outcome.value.forkedId}`);
  }
  return { ok: true };
}

export async function action({ request, params, context }: Route.ActionArgs) {
  const athlete = context.get(userContext)!;
  const templateId = params.templateId;
  const templateService = context.get(templateServiceContext);

  const formData = await request.formData();
  const intent = formData.get('intent');

  if (intent === 'delete') {
    const outcome = await templateService.remove(athlete, templateId);
    if (!outcome.ok && outcome.error === 'not-found') {
      throw data('Template not found', { status: 404 });
    }
    if (!outcome.ok) {
      return data({ error: "Sample templates can't be deleted.", intent: 'delete' }, { status: 400 });
    }
    requestLogger(context).log(`deleted template ${templateId} for user ${athlete.id}`, 'Templates');
    throw redirect('/templates');
  }

  if (intent === 'revert') {
    const outcome = await templateService.revert(athlete, templateId);
    if (!outcome.ok && outcome.error === 'not-found') {
      throw data('Template not found', { status: 404 });
    }
    if (!outcome.ok) {
      return data({ error: 'Nothing to revert', intent: 'revert' }, { status: 400 });
    }
    throw redirect(`/templates/${outcome.value.forkedFromId}`);
  }

  if (intent === 'rename') {
    const result = validateForm(RenameTemplateDto, { name: formData.get('name') });
    if (!result.success) {
      return data({ error: 'Invalid name', intent: 'rename' }, { status: 400 });
    }
    return settle(await templateService.rename(athlete, templateId, result.data.name));
  }

  if (intent === 'addExercise') {
    const result = validateForm(AddExerciseDto, Object.fromEntries(formData));
    if (!result.success) {
      return data({ error: 'Invalid exercise', intent: 'addExercise' }, { status: 400 });
    }

    // Targets are in the athlete's own units; the service converts them.
    const outcome = await templateService.addExercise(athlete, templateId, result.data.exerciseId, {
      sets: result.data.targetSets,
      reps: result.data.targetReps,
      weight: result.data.targetWeight,
      durationMinutes: result.data.targetDurationMinutes,
      speed: result.data.targetSpeed,
      resistance: result.data.targetResistance,
    });
    if (!outcome.ok && outcome.error === 'exercise-not-found') {
      return data({ error: 'Exercise not found', intent: 'addExercise' }, { status: 400 });
    }
    return settle(outcome);
  }

  if (intent === 'removeExercise') {
    const result = validateForm(TemplateExerciseIdDto, { templateExerciseId: formData.get('templateExerciseId') });
    if (!result.success) {
      return data({ error: result.message, intent: 'removeExercise' }, { status: 400 });
    }
    return settle(await templateService.removeExercise(athlete, templateId, result.data.templateExerciseId));
  }

  if (intent === 'move') {
    const result = validateForm(MoveExerciseDto, {
      templateExerciseId: formData.get('templateExerciseId'),
      direction: formData.get('direction'),
    });
    if (!result.success) {
      return data({ error: result.message, intent: 'move' }, { status: 400 });
    }
    return settle(
      await templateService.moveExercise(athlete, templateId, result.data.templateExerciseId, result.data.direction),
    );
  }

  return data({ error: 'Unknown action', intent: 'unknown' }, { status: 400 });
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
  const { showSpeed, showResistance } = cardioFieldsFor(selected?.equipment.map((item) => item.cardioKind) ?? []);

  const pending = fetcher.state !== 'idle';
  const error = fetcher.data && 'error' in fetcher.data ? fetcher.data.error : undefined;

  return (
    <fetcher.Form method="post" className="flex flex-col gap-4">
      <input type="hidden" name="intent" value="addExercise" />
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

export default function TemplateDetail({ loaderData, actionData }: Route.ComponentProps) {
  const { template, exercises: exerciseList, weightUnit, distanceUnit } = loaderData;

  const exerciseCount = template.exercises.length;
  const { isSample, isCustomized } = template;

  const deleteError = actionData && 'error' in actionData && actionData.intent === 'delete' ? actionData.error : undefined;
  const revertError = actionData && 'error' in actionData && actionData.intent === 'revert' ? actionData.error : undefined;
  const renameError = actionData && 'error' in actionData && actionData.intent === 'rename' ? actionData.error : undefined;

  return (
    <Page width="narrow">
      <PageHeader
        title={template.name}
        badge={
          isSample ? (
            <Badge variant="outline">Sample</Badge>
          ) : isCustomized ? (
            <Badge variant="secondary">Customized</Badge>
          ) : null
        }
        description={`${exerciseCount} exercise${exerciseCount === 1 ? '' : 's'} in this workout.`}
        actions={
          isSample ? null : isCustomized ? (
            <form method="post" className="flex flex-col items-end gap-1.5">
              <input type="hidden" name="intent" value="revert" />
              <SubmitButton variant="outline" size="sm" match={{ intent: 'revert' }} pendingLabel="Reverting">
                <RotateCcwIcon aria-hidden="true" />
                Revert to sample
              </SubmitButton>
              {revertError ? <p className="text-sm font-medium text-destructive">{revertError}</p> : null}
            </form>
          ) : (
            <form method="post" className="flex flex-col items-end gap-1.5">
              <input type="hidden" name="intent" value="delete" />
              <SubmitButton variant="destructive" size="sm" match={{ intent: 'delete' }} pendingLabel="Deleting template">
                <Trash2Icon aria-hidden="true" />
                Delete template
              </SubmitButton>
              {deleteError ? <p className="text-sm font-medium text-destructive">{deleteError}</p> : null}
            </form>
          )
        }
      />

      {isCustomized ? (
        <p className="mt-(--section-gap) text-sm text-muted-foreground">
          This is your customized copy of a sample template. The original sample is unaffected.
        </p>
      ) : null}

      <Card className="mt-(--section-gap) max-w-md">
        <CardHeader>
          <CardTitle>Rename</CardTitle>
          {isSample ? (
            <p className="text-sm text-muted-foreground">Renaming a sample template creates your own customized copy.</p>
          ) : null}
        </CardHeader>
        <CardContent>
          <form method="post">
            <input type="hidden" name="intent" value="rename" />
            <Field
              label="Name"
              error={renameError}
              action={
                <SubmitButton match={{ intent: 'rename' }} pendingLabel="Saving">
                  Save
                </SubmitButton>
              }
            >
              <Input name="name" defaultValue={template.name} required />
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
            {template.exercises.map((te, index) => (
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
                    <input type="hidden" name="intent" value="move" />
                    <input type="hidden" name="templateExerciseId" value={te.id} />
                    <input type="hidden" name="direction" value="up" />
                    <Button type="submit" variant="ghost" size="icon-sm" disabled={index === 0}>
                      <ArrowUpIcon aria-hidden="true" />
                      <span className="sr-only">Move {te.exerciseName} up</span>
                    </Button>
                  </form>
                  <form method="post">
                    <input type="hidden" name="intent" value="move" />
                    <input type="hidden" name="templateExerciseId" value={te.id} />
                    <input type="hidden" name="direction" value="down" />
                    <Button type="submit" variant="ghost" size="icon-sm" disabled={index === exerciseCount - 1}>
                      <ArrowDownIcon aria-hidden="true" />
                      <span className="sr-only">Move {te.exerciseName} down</span>
                    </Button>
                  </form>
                  <form method="post">
                    <input type="hidden" name="intent" value="removeExercise" />
                    <input type="hidden" name="templateExerciseId" value={te.id} />
                    <Button
                      type="submit"
                      variant="ghost"
                      size="icon-sm"
                      className="hover:bg-destructive/10 hover:text-destructive"
                    >
                      <XIcon aria-hidden="true" />
                      <span className="sr-only">Remove {te.exerciseName} from this template</span>
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
