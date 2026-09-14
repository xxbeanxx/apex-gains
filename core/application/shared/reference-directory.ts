import type { EquipmentRepository } from '~application/ports/persistence/equipment-repository';
import type { ExercisesRepository } from '~application/ports/persistence/exercises-repository';
import type { WorkoutsRepository } from '~application/ports/persistence/workouts-repository';
import { type CardioFields, cardioFieldsFor } from '~domain/equipment/cardio-fields';
import type { CardioKind } from '~domain/equipment/equipment';
import type { Exercise } from '~domain/exercise/exercise';
import type { ExerciseType } from '~domain/exercise/exercise-type';
import type { Workout } from '~domain/workout/workout';

/**
 * The ids a read model needs resolved. Either list may be omitted, and
 * nothing is queried for a kind that names no ids.
 */
export type ReferencedIds = {
  readonly exerciseIds?: Iterable<string>;
  readonly workoutIds?: Iterable<string>;
};

/**
 * What an exercise reference resolves to - enough to label it and to decide
 * which measurements a form offers.
 *
 * `id` is the row the reference resolved to, which under the forward-looking
 * reading is the athlete's fork rather than the id they asked about. It is
 * what a caller should post back or key on, since that is the row the
 * athlete is actually training.
 */
export type ExerciseReference = {
  readonly id: string;
  readonly name: string;
  readonly exerciseType: ExerciseType;
  readonly cardioFields: CardioFields;
};

/**
 * Turns the exercise and workout ids other aggregates hold back into the
 * rows they name.
 *
 * A logged set, a session, a plan slot and a workout entry all hold an id
 * rather than the thing itself, and there are two ways to read one (see
 * CONTEXT.md). A historical reference - what a set was logged against, what
 * a session trained - means exactly the row it recorded. A forward-looking
 * reference - what a slot schedules, what an entry targets - means the
 * athlete's fork of that row when they have one, because that is what they
 * now train. A read model picks one reading when it builds the directory and
 * never mixes the two.
 *
 * Both readings resolve by id, never through the athlete's library: the
 * library hides a sample once it is forked, and history recorded against
 * the sample still belongs to it. Nor does either check ownership - the ids
 * handed in must come off the athlete's own aggregates, which only ever name
 * their own rows or samples. An id taken from a form still goes through the
 * repository's `findVisible`.
 */
export class ReferenceDirectory {
  constructor(
    private readonly exercises: ExercisesRepository,
    private readonly workouts: WorkoutsRepository,
    private readonly equipment: EquipmentRepository,
  ) {}

  /**
   * Each id resolves to exactly the row it names.
   */
  historical(ids: ReferencedIds): Promise<ResolvedReferences> {
    return this.resolve(ids, null);
  }

  /**
   * Each id resolves to `athleteId`'s fork of it when they have one, and to
   * the row it names otherwise.
   */
  forwardLooking(athleteId: string, ids: ReferencedIds): Promise<ResolvedReferences> {
    return this.resolve(ids, athleteId);
  }

  private async resolve(ids: ReferencedIds, forkOwner: string | null): Promise<ResolvedReferences> {
    const exerciseIds = unique(ids.exerciseIds);
    const workoutIds = unique(ids.workoutIds);

    const [exercises, workouts] = await Promise.all([
      resolveEach(exerciseIds, forkOwner, this.exercises),
      resolveEach(workoutIds, forkOwner, this.workouts),
    ]);

    const equipmentIds = unique([...exercises.values()].flatMap((exercise) => exercise.equipmentIds));
    const equipment = equipmentIds.length === 0 ? [] : await this.equipment.findManyByIds(equipmentIds);
    const cardioKindById = new Map(equipment.map((item) => [item.id, item.cardioKind]));

    return new ResolvedReferences(exercises, workouts, cardioKindById);
  }
}

/**
 * One directory lookup's answers, read synchronously.
 *
 * An id it was never asked about, or one naming a row that doesn't exist,
 * falls back rather than throwing. By id that should not happen - the
 * schema restricts deleting a referenced exercise and nulls a deleted
 * workout's references - so the fallback guards a page against one broken
 * row, and stating it once is what keeps every read model agreeing on it.
 */
export class ResolvedReferences {
  constructor(
    private readonly exerciseById: ReadonlyMap<string, Exercise>,
    private readonly workoutById: ReadonlyMap<string, Workout>,
    private readonly cardioKindById: ReadonlyMap<string, CardioKind | null>,
  ) {}

  /**
   * Every exercise resolved, for a domain calculation over the whole span.
   */
  get exercises(): Exercise[] {
    return [...new Map([...this.exerciseById.values()].map((exercise) => [exercise.id, exercise])).values()];
  }

  exercise(exerciseId: string): ExerciseReference {
    const exercise = this.exerciseById.get(exerciseId);
    if (!exercise) {
      return { id: exerciseId, name: UNKNOWN, exerciseType: 'strength', cardioFields: cardioFieldsFor([]) };
    }
    return {
      id: exercise.id,
      name: exercise.name,
      exerciseType: exercise.exerciseType,
      cardioFields: cardioFieldsFor(exercise.equipmentIds.map((id) => this.cardioKindById.get(id) ?? null)),
    };
  }

  /**
   * The whole workout, for a read model that renders its entries; null when
   * it resolved to nothing.
   */
  workout(workoutId: string): Workout | null {
    return this.workoutById.get(workoutId) ?? null;
  }

  workoutName(workoutId: string): string {
    return this.workoutById.get(workoutId)?.name ?? UNKNOWN;
  }
}

const UNKNOWN = 'Unknown';

type ForkableRows<T> = {
  findManyByIds(ids: readonly string[]): Promise<T[]>;
  findForksOf(userId: string, sampleIds: readonly string[]): Promise<T[]>;
};

/**
 * Keyed by the id asked about, not by the resolved row's own id - under the
 * forward-looking reading those differ, and callers only know the former.
 */
async function resolveEach<T extends { id: string; forkedFromId: string | null }>(
  ids: string[],
  forkOwner: string | null,
  rows: ForkableRows<T>,
): Promise<Map<string, T>> {
  const resolved = new Map<string, T>();

  if (ids.length === 0) {
    return resolved;
  }

  if (forkOwner !== null) {
    for (const fork of await rows.findForksOf(forkOwner, ids)) {
      resolved.set(fork.forkedFromId!, fork);
    }
  }

  const remaining = ids.filter((id) => !resolved.has(id));
  if (remaining.length > 0) {
    for (const row of await rows.findManyByIds(remaining)) {
      resolved.set(row.id, row);
    }
  }
  return resolved;
}

function unique(ids: Iterable<string> | undefined): string[] {
  return ids ? [...new Set(ids)] : [];
}
