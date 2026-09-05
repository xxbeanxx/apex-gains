import { Expose, Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { DumbbellIcon, PlusIcon, SearchIcon, Settings2Icon } from 'lucide-react';
import { useMemo, useState } from 'react';
import { data } from 'react-router';

import { requireAthlete } from '~/auth/user-context';
import { EquipmentDialog } from '~/components/exercises/equipment-dialog';
import { ExerciseCard } from '~/components/exercises/exercise-card';
import { sourceOf, type ExerciseSource, SOURCE_LABEL } from '~/components/exercises/exercise-source';
import { ExerciseTableRow } from '~/components/exercises/exercise-table-row';
import { NewExerciseDialog } from '~/components/exercises/new-exercise-dialog';
import { Page, PageHeader } from '~/components/layout/page';
import { Button } from '~/components/ui/button';
import { EmptyState } from '~/components/ui/empty-state';
import { FacetFilter, type FacetOption } from '~/components/ui/facet-filter';
import { Input } from '~/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '~/components/ui/table';
import { CARDIO_KINDS, type CardioKind } from '~/domain/equipment/equipment';
import { EXERCISE_TYPES, type ExerciseType } from '~/domain/exercise/exercise-type';
import { intent } from '~/lib/intent';
import { dispatch, handled } from '~/lib/intent.server';
import { optionalTrim, trim } from '~/lib/validate-form';
import type { ExerciseView } from '~/services/exercise-library-service.server';

import { exerciseLibraryServiceContext } from '~/lib/nest-bridge.server';

import type { Route } from './+types/exercises';

export function meta() {
  return [{ title: 'Exercises - Apex Gains' }];
}

export const handle = { crumb: () => ({ label: 'Exercises' }) };

export const typeLabels: Record<ExerciseType, string> = {
  strength: 'Strength',
  cardio: 'Cardio',
};

/**
 * Radix `Select` reserves the empty string for its own placeholder/clear
 * state, so "no restriction" is spelled out as this sentinel on the wire and
 * translated to `null` (the domain's actual "no restriction" value) at the
 * schema boundary.
 */
export const NO_CARDIO_KIND = 'none';
const cardioKindOptionValues = [...CARDIO_KINDS, NO_CARDIO_KIND] as const;
export const cardioKindLabels: Record<CardioKind, string> = {
  speed: 'Speed only',
  resistance: 'Resistance only',
};

export async function loader({ context }: Route.LoaderArgs) {
  const athlete = requireAthlete(context);
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

export const intents = {
  addEquipment: intent('addEquipment', AddEquipmentDto),
  deleteEquipment: intent('deleteEquipment', EquipmentIdDto),
  setEquipmentCardioKind: intent('setEquipmentCardioKind', SetCardioKindDto, { invalidMessage: 'Invalid cardio fields' }),
  toggleExerciseEquipment: intent('toggleExerciseEquipment', ToggleExerciseEquipmentDto, { invalidMessage: 'Invalid toggle' }),
  createExercise: intent('createExercise', ExerciseDetailsDto),
  updateExercise: intent('updateExercise', UpdateExerciseDto),
  revertExercise: intent('revertExercise', ExerciseIdDto),
};

export async function action({ request, context }: Route.ActionArgs) {
  const athlete = requireAthlete(context);
  const libraryService = context.get(exerciseLibraryServiceContext);

  return dispatch(request, [
    handled(intents.addEquipment, async ({ name, cardioKind }) => {
      await libraryService.addEquipment(athlete, name, toCardioKind(cardioKind));
      return { ok: true };
    }),

    handled(intents.deleteEquipment, async ({ equipmentId }) => {
      await libraryService.removeEquipment(athlete, equipmentId);
      return { ok: true };
    }),

    handled(intents.setEquipmentCardioKind, async ({ equipmentId, cardioKind }) => {
      await libraryService.setEquipmentCardioKind(athlete, equipmentId, toCardioKind(cardioKind));
      return { ok: true };
    }),

    handled(intents.toggleExerciseEquipment, async ({ exerciseId, equipmentId, checked }) => {
      // A toggle on a since-deleted exercise is ignored rather than surfaced -
      // the list is about to revalidate and the row will be gone anyway.
      await libraryService.setExerciseEquipment(athlete, exerciseId, equipmentId, checked === 'true');
      return { ok: true };
    }),

    handled(intents.createExercise, async (details) => {
      const outcome = await libraryService.createExercise(athlete, {
        name: details.name,
        exerciseType: details.exerciseType,
        muscleGroup: details.muscleGroup ?? null,
        description: details.description ?? null,
      });
      if (!outcome.ok) {
        return intents.createExercise.reject('An exercise with this name already exists');
      }
      return { ok: true };
    }),

    handled(intents.updateExercise, async (details) => {
      const outcome = await libraryService.updateExercise(athlete, details.exerciseId, {
        name: details.name,
        exerciseType: details.exerciseType,
        muscleGroup: details.muscleGroup ?? null,
        description: details.description ?? null,
      });
      if (!outcome.ok) {
        return outcome.error === 'not-found'
          ? data({ error: 'Exercise not found', intent: intents.updateExercise.name }, { status: 404 })
          : intents.updateExercise.reject('An exercise with this name already exists');
      }
      return { ok: true };
    }),

    handled(intents.revertExercise, async ({ exerciseId }) => {
      const outcome = await libraryService.revertExercise(athlete, exerciseId);
      if (!outcome.ok) {
        return intents.revertExercise.reject(
          outcome.error === 'nothing-to-revert'
            ? 'Nothing to revert'
            : 'This customization is used in a workout or logged workout — remove it from those first.',
        );
      }
      return { ok: true };
    }),
  ]);
}

function matchesQuery(exercise: ExerciseView, needle: string): boolean {
  if (needle === '') return true;
  return (
    exercise.name.toLowerCase().includes(needle) ||
    (exercise.muscleGroup ?? '').toLowerCase().includes(needle) ||
    exercise.equipment.some((item) => item.name.toLowerCase().includes(needle))
  );
}

function matchesTypes(exercise: ExerciseView, types: ReadonlySet<string>): boolean {
  return types.size === 0 || types.has(exercise.exerciseType);
}

function matchesEquipment(exercise: ExerciseView, equipmentIds: ReadonlySet<string>): boolean {
  return equipmentIds.size === 0 || exercise.equipment.some((item) => equipmentIds.has(item.id));
}

function matchesSources(exercise: ExerciseView, sources: ReadonlySet<string>): boolean {
  return sources.size === 0 || sources.has(sourceOf(exercise));
}

function countBy<T extends string>(exercises: ExerciseView[], values: readonly T[], key: (exercise: ExerciseView) => T) {
  const counts = Object.fromEntries(values.map((value) => [value, 0])) as Record<T, number>;
  for (const exercise of exercises) counts[key(exercise)]++;
  return counts;
}

export default function Exercises({ loaderData }: Route.ComponentProps) {
  const { equipment: equipmentList, exercises: exerciseList } = loaderData;

  const [query, setQuery] = useState('');
  const [types, setTypes] = useState<Set<string>>(new Set());
  const [equipmentIds, setEquipmentIds] = useState<Set<string>>(new Set());
  const [sources, setSources] = useState<Set<string>>(new Set());

  const needle = query.trim().toLowerCase();
  const searched = useMemo(() => exerciseList.filter((exercise) => matchesQuery(exercise, needle)), [exerciseList, needle]);

  // Each facet's counts come from the pool the *other* facets already
  // narrow to, not the fully-filtered result - otherwise every chip would
  // converge on the same final count instead of showing what it would add.
  const poolForType = useMemo(
    () => searched.filter((e) => matchesEquipment(e, equipmentIds) && matchesSources(e, sources)),
    [searched, equipmentIds, sources],
  );
  const poolForEquipment = useMemo(
    () => searched.filter((e) => matchesTypes(e, types) && matchesSources(e, sources)),
    [searched, types, sources],
  );
  const poolForSource = useMemo(
    () => searched.filter((e) => matchesTypes(e, types) && matchesEquipment(e, equipmentIds)),
    [searched, types, equipmentIds],
  );

  const visible = useMemo(
    () =>
      searched
        .filter((e) => matchesTypes(e, types) && matchesEquipment(e, equipmentIds) && matchesSources(e, sources))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [searched, types, equipmentIds, sources],
  );

  const typeCounts = countBy(poolForType, EXERCISE_TYPES, (e) => e.exerciseType);
  const typeOptions: FacetOption[] = EXERCISE_TYPES.map((value) => ({
    value,
    label: typeLabels[value],
    count: typeCounts[value],
  }));

  const equipmentOptions: FacetOption[] = equipmentList.map((eq) => ({
    value: eq.id,
    label: eq.name,
    count: poolForEquipment.filter((e) => e.equipment.some((item) => item.id === eq.id)).length,
  }));

  const sourceValues: ExerciseSource[] = ['sample', 'mine', 'customized'];
  const sourceCounts = countBy(poolForSource, sourceValues, sourceOf);
  const sourceOptions: FacetOption[] = sourceValues.map((value) => ({
    value,
    label: SOURCE_LABEL[value],
    count: sourceCounts[value],
  }));

  const isFiltered = needle !== '' || types.size > 0 || equipmentIds.size > 0 || sources.size > 0;
  const clearFilters = () => {
    setQuery('');
    setTypes(new Set());
    setEquipmentIds(new Set());
    setSources(new Set());
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
            description="Build the library one movement at a time — each one can be dropped into any workout."
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
          <div className="mt-8 flex flex-wrap items-center gap-2">
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

            <FacetFilter label="Type" options={typeOptions} selected={types} onChange={setTypes} />
            {equipmentList.length > 0 ? (
              <FacetFilter label="Equipment" options={equipmentOptions} selected={equipmentIds} onChange={setEquipmentIds} />
            ) : null}
            <FacetFilter label="Source" options={sourceOptions} selected={sources} onChange={setSources} />
          </div>

          {visible.length === 0 ? (
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
            <>
              <div className="mt-6 hidden overflow-hidden rounded-xl bg-card shadow-sm shadow-black/[0.03] ring-1 ring-foreground/10 md:block dark:shadow-black/20">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Equipment</TableHead>
                      <TableHead>Source</TableHead>
                      <TableHead className="w-10" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visible.map((exercise) => (
                      <ExerciseTableRow key={exercise.id} exercise={exercise} allEquipment={equipmentList} />
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="stagger mt-6 flex flex-col gap-2 md:hidden">
                {visible.map((exercise) => (
                  <ExerciseCard key={exercise.id} exercise={exercise} allEquipment={equipmentList} />
                ))}
              </div>
            </>
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
