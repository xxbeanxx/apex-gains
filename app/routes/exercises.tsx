import { Expose, Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { ChevronRightIcon, DumbbellIcon, PlusIcon, RotateCcwIcon, SearchIcon, Settings2Icon, XIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { data, useFetcher } from 'react-router';

import { userContext } from '~/auth/user-context';
import { Page, PageHeader } from '~/components/layout/page';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { Checkbox } from '~/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '~/components/ui/dialog';
import { EmptyState } from '~/components/ui/empty-state';
import { Field } from '~/components/ui/field';
import { Input } from '~/components/ui/input';
import { SubmitButton } from '~/components/ui/submit-button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/components/ui/select';
import { Textarea } from '~/components/ui/textarea';
import { CARDIO_KINDS, type CardioKind } from '~/domain/equipment/equipment';
import { EXERCISE_TYPES, type ExerciseType } from '~/domain/exercise/exercise-type';
import { optionalTrim, trim } from '~/lib/validate-form';
import { validateForm } from '~/lib/validate-form.server';
import type { EquipmentView, ExerciseView } from '~/services/exercise-library-service.server';

import { exerciseLibraryServiceContext } from '~/lib/nest-bridge.server';

import type { Route } from './+types/exercises';

export function meta() {
  return [{ title: 'Exercises - Apex Gains' }];
}

const typeLabels: Record<string, string> = {
  strength: 'Strength',
  cardio: 'Cardio',
};

/**
 * Radix `Select` reserves the empty string for its own placeholder/clear
 * state, so "no restriction" is spelled out as this sentinel on the wire and
 * translated to `null` (the domain's actual "no restriction" value) at the
 * schema boundary.
 */
const NO_CARDIO_KIND = 'none';
const cardioKindOptionValues = [...CARDIO_KINDS, NO_CARDIO_KIND] as const;
const cardioKindLabels: Record<CardioKind, string> = {
  speed: 'Speed only',
  resistance: 'Resistance only',
};

export async function loader({ context }: Route.LoaderArgs) {
  const athlete = context.get(userContext)!;
  const libraryService = context.get(exerciseLibraryServiceContext);
  return await libraryService.library(athlete);
}

/** Maps the wire-level `'none'` sentinel to the domain's actual "no restriction" value. */
function toCardioKind(value: (typeof cardioKindOptionValues)[number]): CardioKind | null {
  return value === NO_CARDIO_KIND ? null : value;
}

class AddEquipmentDto {
  @Expose()
  @Transform(trim())
  @IsString()
  @MinLength(1, { message: 'Name is required' })
  @MaxLength(100)
  readonly name!: string;

  @Expose()
  @IsIn(cardioKindOptionValues)
  readonly cardioKind!: (typeof cardioKindOptionValues)[number];
}

class SetCardioKindDto {
  @Expose()
  @IsUUID()
  readonly equipmentId!: string;

  @Expose()
  @IsIn(cardioKindOptionValues)
  readonly cardioKind!: (typeof cardioKindOptionValues)[number];
}

class ToggleExerciseEquipmentDto {
  @Expose()
  @IsUUID()
  readonly exerciseId!: string;

  @Expose()
  @IsUUID()
  readonly equipmentId!: string;

  @Expose()
  @IsIn(['true', 'false'])
  readonly checked!: 'true' | 'false';
}

class ExerciseDetailsDto {
  @Expose()
  @Transform(trim())
  @IsString()
  @MinLength(1, { message: 'Name is required' })
  @MaxLength(100)
  readonly name!: string;

  @Expose()
  @IsIn(EXERCISE_TYPES)
  readonly exerciseType!: ExerciseType;

  @Expose()
  @Transform(optionalTrim())
  @IsOptional()
  @IsString()
  @MaxLength(50)
  readonly muscleGroup?: string;

  @Expose()
  @Transform(optionalTrim())
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  readonly description?: string;
}

class UpdateExerciseDto extends ExerciseDetailsDto {
  @Expose()
  @IsUUID()
  readonly exerciseId!: string;
}

class EquipmentIdDto {
  @Expose()
  @IsUUID()
  readonly equipmentId!: string;
}

class ExerciseIdDto {
  @Expose()
  @IsUUID()
  readonly exerciseId!: string;
}

export async function action({ request, context }: Route.ActionArgs) {
  const athlete = context.get(userContext)!;
  const formData = await request.formData();
  const intent = formData.get('intent');

  const libraryService = context.get(exerciseLibraryServiceContext);

  if (intent === 'addEquipment') {
    const result = validateForm(AddEquipmentDto, { name: formData.get('name'), cardioKind: formData.get('cardioKind') });
    if (!result.success) {
      return data({ error: result.message }, { status: 400 });
    }
    await libraryService.addEquipment(athlete, result.data.name, toCardioKind(result.data.cardioKind));
    return { ok: true };
  }

  if (intent === 'deleteEquipment') {
    const result = validateForm(EquipmentIdDto, { equipmentId: formData.get('equipmentId') });
    if (!result.success) {
      return data({ error: result.message }, { status: 400 });
    }
    await libraryService.removeEquipment(athlete, result.data.equipmentId);
    return { ok: true };
  }

  if (intent === 'setEquipmentCardioKind') {
    const result = validateForm(SetCardioKindDto, Object.fromEntries(formData));
    if (!result.success) {
      return data({ error: 'Invalid cardio fields' }, { status: 400 });
    }
    await libraryService.setEquipmentCardioKind(athlete, result.data.equipmentId, toCardioKind(result.data.cardioKind));
    return { ok: true };
  }

  if (intent === 'toggleExerciseEquipment') {
    const result = validateForm(ToggleExerciseEquipmentDto, Object.fromEntries(formData));
    if (!result.success) {
      return data({ error: 'Invalid toggle' }, { status: 400 });
    }
    // A toggle on a since-deleted exercise is ignored rather than surfaced -
    // the list is about to revalidate and the row will be gone anyway.
    await libraryService.setExerciseEquipment(
      athlete,
      result.data.exerciseId,
      result.data.equipmentId,
      result.data.checked === 'true',
    );
    return { ok: true };
  }

  if (intent === 'createExercise') {
    const result = validateForm(ExerciseDetailsDto, Object.fromEntries(formData));
    if (!result.success) {
      return data({ error: result.message }, { status: 400 });
    }
    const outcome = await libraryService.createExercise(athlete, {
      name: result.data.name,
      exerciseType: result.data.exerciseType,
      muscleGroup: result.data.muscleGroup ?? null,
      description: result.data.description ?? null,
    });
    if (!outcome.ok) {
      return data({ error: 'An exercise with this name already exists' }, { status: 400 });
    }
    return { ok: true };
  }

  if (intent === 'updateExercise') {
    const result = validateForm(UpdateExerciseDto, Object.fromEntries(formData));
    if (!result.success) {
      return data({ error: result.message }, { status: 400 });
    }

    const outcome = await libraryService.updateExercise(athlete, result.data.exerciseId, {
      name: result.data.name,
      exerciseType: result.data.exerciseType,
      muscleGroup: result.data.muscleGroup ?? null,
      description: result.data.description ?? null,
    });
    if (!outcome.ok) {
      return outcome.error === 'not-found'
        ? data({ error: 'Exercise not found' }, { status: 404 })
        : data({ error: 'An exercise with this name already exists' }, { status: 400 });
    }
    return { ok: true };
  }

  if (intent === 'revertExercise') {
    const idResult = validateForm(ExerciseIdDto, { exerciseId: formData.get('exerciseId') });
    if (!idResult.success) {
      return data({ error: idResult.message }, { status: 400 });
    }
    const outcome = await libraryService.revertExercise(athlete, idResult.data.exerciseId);
    if (!outcome.ok) {
      return outcome.error === 'nothing-to-revert'
        ? data({ error: 'Nothing to revert' }, { status: 400 })
        : data(
            {
              error: 'This customization is used in a template or logged workout — remove it from those first.',
            },
            { status: 400 },
          );
    }
    return { ok: true };
  }

  return data({ error: 'Unknown action' }, { status: 400 });
}

function ExerciseDetailsFields({
  defaultValues,
  error,
}: {
  defaultValues?: {
    name: string;
    exerciseType: string;
    muscleGroup: string | null;
    description: string | null;
  };
  error?: string;
}) {
  // Every id here comes from `Field`'s `useId`, so rendering this block twice
  // on one page (the create form and an edit dialog) no longer produces
  // colliding ids or labels pointing at the wrong input.
  return (
    <div className="flex flex-col gap-4">
      <Field label="Name" error={error}>
        <Input name="name" defaultValue={defaultValues?.name} placeholder="Cable Crossover" required />
      </Field>
      <Field label="Type">
        {({ id }) => (
          <Select name="exerciseType" defaultValue={defaultValues?.exerciseType ?? 'strength'}>
            <SelectTrigger id={id} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="strength">Strength</SelectItem>
              <SelectItem value="cardio">Cardio</SelectItem>
            </SelectContent>
          </Select>
        )}
      </Field>
      <Field label="Muscle group">
        <Input name="muscleGroup" defaultValue={defaultValues?.muscleGroup ?? ''} placeholder="chest" />
      </Field>
      <Field label="Description">
        <Textarea
          name="description"
          defaultValue={defaultValues?.description ?? ''}
          placeholder="How to perform this exercise, form cues, etc."
          rows={3}
        />
      </Field>
    </div>
  );
}

function ExerciseEditorDialog({
  exercise,
  allEquipment,
  children,
}: {
  exercise: ExerciseView;
  allEquipment: EquipmentView[];
  /** The trigger. The whole library row is the control that opens this. */
  children: ReactNode;
}) {
  const fetcher = useFetcher();
  const revertFetcher = useFetcher();
  const linkedIds = new Set(exercise.equipment.map((item) => item.id));
  const isCustomized = exercise.canRevert;

  const error = fetcher.data && 'error' in fetcher.data ? fetcher.data.error : undefined;
  const revertError = revertFetcher.data && 'error' in revertFetcher.data ? revertFetcher.data.error : undefined;

  return (
    <Dialog>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{exercise.name}</DialogTitle>
        </DialogHeader>
        {isCustomized ? (
          <div className="flex flex-col gap-2 rounded-lg bg-muted px-3 py-2.5 text-sm">
            <p className="text-muted-foreground">
              This is your customized copy of a sample exercise. The original sample is unaffected.
            </p>
            <revertFetcher.Form method="post" className="flex flex-col gap-2">
              <input type="hidden" name="intent" value="revertExercise" />
              <input type="hidden" name="exerciseId" value={exercise.id} />
              {revertError ? <p className="text-destructive">{revertError}</p> : null}
              <SubmitButton
                variant="outline"
                size="sm"
                pending={revertFetcher.state !== 'idle'}
                pendingLabel="Reverting"
                className="self-start"
              >
                <RotateCcwIcon aria-hidden="true" />
                Revert to sample
              </SubmitButton>
            </revertFetcher.Form>
          </div>
        ) : null}
        <fetcher.Form method="post" className="flex flex-col gap-4">
          <input type="hidden" name="intent" value="updateExercise" />
          <input type="hidden" name="exerciseId" value={exercise.id} />
          <ExerciseDetailsFields defaultValues={exercise} error={error} />
          <SubmitButton pending={fetcher.state !== 'idle'} pendingLabel="Saving exercise" className="self-start">
            Save
          </SubmitButton>
        </fetcher.Form>

        <div className="flex flex-col gap-3 border-t border-border pt-4">
          <p className="text-sm font-medium">Equipment</p>
          {allEquipment.map((eq) => (
            <EquipmentCheckboxRow
              key={eq.id}
              exerciseId={exercise.id}
              equipmentId={eq.id}
              name={eq.name}
              defaultChecked={linkedIds.has(eq.id)}
            />
          ))}
          {allEquipment.length === 0 ? (
            <p className="text-sm text-muted-foreground">No equipment yet — add some with “Manage equipment” first.</p>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function EquipmentCheckboxRow({
  exerciseId,
  equipmentId,
  name,
  defaultChecked,
}: {
  exerciseId: string;
  equipmentId: string;
  name: string;
  defaultChecked: boolean;
}) {
  const fetcher = useFetcher();
  const [checked, setChecked] = useState(defaultChecked);

  return (
    <label className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm transition-colors duration-(--dur-fast) hover:bg-muted has-[:focus-visible]:bg-muted">
      <Checkbox
        checked={checked}
        onCheckedChange={(value) => {
          const isChecked = value === true;
          setChecked(isChecked);
          fetcher.submit(
            {
              intent: 'toggleExerciseEquipment',
              exerciseId,
              equipmentId,
              checked: String(isChecked),
            },
            { method: 'post' },
          );
        }}
      />
      {name}
    </label>
  );
}

function NewExerciseForm({ onCreated }: { onCreated: () => void }) {
  const fetcher = useFetcher();
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (fetcher.state === 'idle' && fetcher.data && !('error' in fetcher.data)) {
      formRef.current?.reset();
      onCreated();
    }
  }, [fetcher.state, fetcher.data, onCreated]);

  const pending = fetcher.state !== 'idle';
  const error = fetcher.data && 'error' in fetcher.data ? fetcher.data.error : undefined;

  return (
    <fetcher.Form ref={formRef} method="post" className="flex flex-col gap-4">
      <input type="hidden" name="intent" value="createExercise" />
      <ExerciseDetailsFields error={error} />
      <SubmitButton pending={pending} pendingLabel="Creating exercise" variant="brand" className="self-start">
        {pending ? null : <PlusIcon aria-hidden="true" />}
        Create exercise
      </SubmitButton>
    </fetcher.Form>
  );
}

/**
 * The create form lives behind this dialog rather than on the page: creating an
 * exercise is rare, browsing the library is not, so the library gets the space.
 * The form is only mounted while the dialog is open, which is what resets its
 * fetcher state between openings.
 */
function NewExerciseDialog({ trigger }: { trigger: ReactNode }) {
  const [open, setOpen] = useState(false);
  // Stable identity: the form has this in an effect's dependencies.
  const close = useCallback(() => setOpen(false), []);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New exercise</DialogTitle>
          <DialogDescription>Equipment is linked afterward, from the exercise’s own editor.</DialogDescription>
        </DialogHeader>
        <NewExerciseForm onCreated={close} />
      </DialogContent>
    </Dialog>
  );
}

function EquipmentRow({ equipment }: { equipment: EquipmentView }) {
  const deleteFetcher = useFetcher();
  const cardioKindFetcher = useFetcher();
  const [cardioKind, setCardioKind] = useState(equipment.cardioKind ?? NO_CARDIO_KIND);

  return (
    // Hidden while its own delete is in flight so the row goes away on click
    // rather than at the end of the revalidation round-trip.
    <li className="flex items-center gap-2 px-3 py-2" hidden={deleteFetcher.state !== 'idle'}>
      <span className="min-w-0 flex-1 text-pretty">{equipment.name}</span>
      {equipment.isSample ? (
        <>
          {equipment.cardioKind ? <Badge variant="outline">{cardioKindLabels[equipment.cardioKind]}</Badge> : null}
          <Badge variant="outline">Sample</Badge>
        </>
      ) : (
        <>
          <Select
            value={cardioKind}
            onValueChange={(value) => {
              setCardioKind(value);
              cardioKindFetcher.submit(
                { intent: 'setEquipmentCardioKind', equipmentId: equipment.id, cardioKind: value },
                { method: 'post' },
              );
            }}
          >
            <SelectTrigger size="sm" aria-label={`Cardio fields for ${equipment.name}`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_CARDIO_KIND}>Speed & resistance</SelectItem>
              <SelectItem value="speed">Speed only</SelectItem>
              <SelectItem value="resistance">Resistance only</SelectItem>
            </SelectContent>
          </Select>
          <deleteFetcher.Form method="post" className="flex">
            <input type="hidden" name="intent" value="deleteEquipment" />
            <input type="hidden" name="equipmentId" value={equipment.id} />
            <Button type="submit" variant="ghost" size="icon-sm">
              <XIcon aria-hidden="true" />
              <span className="sr-only">Remove {equipment.name}</span>
            </Button>
          </deleteFetcher.Form>
        </>
      )}
    </li>
  );
}

function EquipmentDialog({ equipment, trigger }: { equipment: EquipmentView[]; trigger: ReactNode }) {
  const fetcher = useFetcher();
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (fetcher.state === 'idle' && fetcher.data && !('error' in fetcher.data)) {
      formRef.current?.reset();
    }
  }, [fetcher.state, fetcher.data]);

  const error = fetcher.data && 'error' in fetcher.data ? fetcher.data.error : undefined;

  return (
    <Dialog>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Equipment</DialogTitle>
          <DialogDescription>
            Add the equipment you own, then link it to exercises from each exercise’s editor. An exercise can use more than one
            — e.g. Standing Biceps Curl on both the BowFlex and free weights.
          </DialogDescription>
        </DialogHeader>

        {equipment.length > 0 ? (
          <ul className="divide-y divide-border/60 overflow-hidden rounded-lg ring-1 ring-foreground/10">
            {equipment.map((eq) => (
              <EquipmentRow key={eq.id} equipment={eq} />
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No equipment yet. Add your first one below.</p>
        )}

        <fetcher.Form ref={formRef} method="post" className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="intent" value="addEquipment" />
          <Field label="Add equipment" error={error} className="min-w-40 flex-1">
            <Input name="name" placeholder="Free Weights" required />
          </Field>
          <Field label="Cardio fields" className="w-44">
            {({ id }) => (
              <Select name="cardioKind" defaultValue={NO_CARDIO_KIND}>
                <SelectTrigger id={id} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_CARDIO_KIND}>Speed & resistance</SelectItem>
                  <SelectItem value="speed">Speed only</SelectItem>
                  <SelectItem value="resistance">Resistance only</SelectItem>
                </SelectContent>
              </Select>
            )}
          </Field>
          <SubmitButton pending={fetcher.state !== 'idle'} pendingLabel="Adding equipment">
            Add
          </SubmitButton>
        </fetcher.Form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Muscle groups read in body order rather than alphabetically. Anything the
 * user typed that isn't in here sorts alphabetically after these, and the two
 * synthetic buckets below always come last.
 */
const muscleGroupOrder = ['chest', 'back', 'shoulders', 'arms', 'core', 'legs'];

/** Cardio movements carry no muscle group, so they get a bucket of their own. */
const cardioGroup = 'cardio';
const ungroupedGroup = 'other';

function groupKeyFor(exercise: ExerciseView) {
  if (exercise.muscleGroup?.trim()) {
    return exercise.muscleGroup.trim().toLowerCase();
  }
  return exercise.exerciseType === 'cardio' ? cardioGroup : ungroupedGroup;
}

function groupRank(key: string) {
  if (key === ungroupedGroup) return muscleGroupOrder.length + 2;
  if (key === cardioGroup) return muscleGroupOrder.length + 1;
  const index = muscleGroupOrder.indexOf(key);
  return index === -1 ? muscleGroupOrder.length : index;
}

function groupExercises(exercises: ExerciseView[]) {
  const groups = new Map<string, ExerciseView[]>();
  for (const exercise of exercises) {
    const key = groupKeyFor(exercise);
    const list = groups.get(key);
    if (list) list.push(exercise);
    else groups.set(key, [exercise]);
  }

  return [...groups.entries()]
    .map(([key, list]) => ({
      key,
      exercises: [...list].sort((a, b) => a.name.localeCompare(b.name)),
    }))
    .sort((a, b) => groupRank(a.key) - groupRank(b.key) || a.key.localeCompare(b.key));
}

/** A filter pill row. Radix `Tabs` would imply panels; these only filter. */
function TypeFilter({
  value,
  onChange,
  counts,
}: {
  value: TypeFilterValue;
  onChange: (value: TypeFilterValue) => void;
  counts: Record<TypeFilterValue, number>;
}) {
  return (
    <div
      role="group"
      aria-label="Filter by type"
      className="inline-flex h-9 shrink-0 items-center gap-0.5 rounded-lg bg-muted p-[3px] pointer-coarse:h-11"
    >
      {(['all', 'strength', 'cardio'] as const).map((option) => (
        <button
          key={option}
          type="button"
          aria-pressed={value === option}
          onClick={() => onChange(option)}
          className="inline-flex h-full items-center gap-1.5 rounded-md px-3 text-sm font-medium whitespace-nowrap text-foreground/60 transition-colors duration-(--dur-fast) hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none aria-pressed:bg-background aria-pressed:text-foreground aria-pressed:shadow-sm dark:aria-pressed:bg-input/30"
        >
          {option === 'all' ? 'All' : typeLabels[option]}
          <span className="text-xs tabular-nums opacity-60">{counts[option]}</span>
        </button>
      ))}
    </div>
  );
}

function ExerciseRow({ exercise, allEquipment }: { exercise: ExerciseView; allEquipment: EquipmentView[] }) {
  return (
    <li>
      <ExerciseEditorDialog exercise={exercise} allEquipment={allEquipment}>
        <button
          type="button"
          className="group/row flex w-full items-center gap-2 px-3 py-2.5 text-left transition-colors duration-(--dur-fast) hover:bg-muted focus-visible:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none pointer-coarse:py-3"
        >
          <span className="min-w-0 flex-1 font-medium text-pretty">{exercise.name}</span>
          {exercise.isSample ? null : exercise.canRevert ? (
            <Badge variant="secondary">Customized</Badge>
          ) : (
            <Badge variant="brand-subtle">Yours</Badge>
          )}
          <ChevronRightIcon
            className="size-4 shrink-0 text-muted-foreground/60 transition-transform duration-(--dur-fast) group-hover/row:translate-x-0.5 group-hover/row:text-foreground"
            aria-hidden="true"
          />
        </button>
      </ExerciseEditorDialog>
    </li>
  );
}

type TypeFilterValue = 'all' | 'strength' | 'cardio';

export default function Exercises({ loaderData }: Route.ComponentProps) {
  const { equipment: equipmentList, exercises: exerciseList } = loaderData;

  const [query, setQuery] = useState('');
  const [type, setType] = useState<TypeFilterValue>('all');
  const [equipmentId, setEquipmentId] = useState('all');

  // Search and the equipment picker narrow the pool; the type counts are then
  // taken from that pool so each pill shows what it would actually reveal.
  const pool = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return exerciseList.filter((exercise) => {
      if (equipmentId !== 'all' && !exercise.equipment.some((item) => item.id === equipmentId)) {
        return false;
      }
      if (needle === '') return true;
      return (
        exercise.name.toLowerCase().includes(needle) ||
        (exercise.muscleGroup ?? '').toLowerCase().includes(needle) ||
        exercise.equipment.some((item) => item.name.toLowerCase().includes(needle))
      );
    });
  }, [exerciseList, query, equipmentId]);

  const counts: Record<TypeFilterValue, number> = {
    all: pool.length,
    strength: pool.filter((e) => e.exerciseType === 'strength').length,
    cardio: pool.filter((e) => e.exerciseType === 'cardio').length,
  };

  const visible = type === 'all' ? pool : pool.filter((e) => e.exerciseType === type);
  const groups = useMemo(() => groupExercises(visible), [visible]);

  const isFiltered = query.trim() !== '' || type !== 'all' || equipmentId !== 'all';
  const clearFilters = () => {
    setQuery('');
    setType('all');
    setEquipmentId('all');
  };

  return (
    <Page>
      <PageHeader
        title="Exercise Library"
        description={`${exerciseList.length} movement${exerciseList.length === 1 ? '' : 's'} across ${equipmentList.length} piece${equipmentList.length === 1 ? '' : 's'} of equipment.`}
        actions={
          <>
            <EquipmentDialog
              equipment={equipmentList}
              trigger={
                <Button variant="outline">
                  <Settings2Icon aria-hidden="true" />
                  Manage equipment
                </Button>
              }
            />
            <NewExerciseDialog
              trigger={
                <Button variant="brand">
                  <PlusIcon aria-hidden="true" />
                  New exercise
                </Button>
              }
            />
          </>
        }
      />

      {exerciseList.length === 0 ? (
        <div className="mt-(--section-gap)">
          <EmptyState
            icon={DumbbellIcon}
            title="No exercises yet"
            description="Build the library one movement at a time — each one can be dropped into any template."
            action={
              <NewExerciseDialog
                trigger={
                  <Button variant="brand">
                    <PlusIcon aria-hidden="true" />
                    New exercise
                  </Button>
                }
              />
            }
          />
        </div>
      ) : (
        <>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <div className="relative min-w-56 flex-1 sm:max-w-xs">
              <SearchIcon
                className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search exercises…"
                aria-label="Search exercises"
                className="pl-9"
              />
            </div>

            <TypeFilter value={type} onChange={setType} counts={counts} />

            {equipmentList.length > 0 ? (
              <Select value={equipmentId} onValueChange={setEquipmentId}>
                <SelectTrigger aria-label="Filter by equipment" className="w-auto min-w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All equipment</SelectItem>
                  {equipmentList.map((eq) => (
                    <SelectItem key={eq.id} value={eq.id}>
                      {eq.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}
          </div>

          {groups.length === 0 ? (
            <div className="mt-6">
              <EmptyState
                icon={SearchIcon}
                title="No exercises match"
                description="Try a different search, or widen the filters."
                action={
                  <Button variant="outline" onClick={clearFilters}>
                    Clear filters
                  </Button>
                }
              />
            </div>
          ) : (
            /* CSS columns rather than a grid: muscle groups vary a lot in size
               (legs has 10 movements, arms 4), and columns balance their
               heights instead of leaving every grid row as tall as its tallest
               group. Deliberately no `stagger` - a per-child transform is what
               tips multicol into Chrome's mis-paint, and `Page` already
               animates the whole view in on arrival. */
            <div className="mt-6 gap-x-6 sm:columns-2 xl:columns-3">
              {groups.map((group) => (
                <section key={group.key} className="mb-8 flex break-inside-avoid flex-col gap-2">
                  <h2 className="flex items-baseline gap-2 px-1 font-heading text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                    {group.key}
                    <span className="font-normal tabular-nums opacity-70">{group.exercises.length}</span>
                  </h2>
                  <ul className="divide-y divide-border/60 overflow-hidden rounded-xl bg-card shadow-sm shadow-black/[0.03] ring-1 ring-foreground/10 dark:shadow-black/20">
                    {group.exercises.map((exercise) => (
                      <ExerciseRow key={exercise.id} exercise={exercise} allEquipment={equipmentList} />
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )}

          {isFiltered ? (
            <p className="mt-6 text-sm text-muted-foreground" role="status">
              Showing {visible.length} of {exerciseList.length} exercises.{' '}
              <button
                type="button"
                onClick={clearFilters}
                className="font-medium text-foreground underline decoration-brand-strong decoration-2 underline-offset-4 hover:decoration-4"
              >
                Clear filters
              </button>
            </p>
          ) : null}
        </>
      )}
    </Page>
  );
}
