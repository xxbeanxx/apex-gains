import type { Exercise } from '~/domain/exercise/exercise';
import type { ExerciseType } from '~/domain/exercise/exercise-type';
import type { ExercisesRepository } from '~/repositories/exercises-repository.server';

/**
 * What an exercise id resolves to, for the read models that only need to
 * label one.
 *
 * A logged set, a workout entry and a plan slot all hold an exercise id
 * rather than an exercise - they are separate aggregates - so every read
 * model that renders one has to join the name back in. Doing that by hand
 * meant four services each collecting ids, calling `findManyByIds`, building
 * a `Map`, and spelling the missing-exercise fallback themselves.
 *
 * Resolution is deliberately by id and not through the athlete's library: a
 * set can point at a sample they have since forked away from, which
 * `listFor` hides because the fork now stands in for it. Their past sets
 * still belong to the original.
 */
export class ExerciseDirectory {
  private constructor(private readonly byId: ReadonlyMap<string, Exercise>) {}

  /** One lookup for every id named, in any order and with duplicates. */
  static async of(exerciseIds: Iterable<string>, exercises: ExercisesRepository): Promise<ExerciseDirectory> {
    const found = await exercises.findManyByIds([...new Set(exerciseIds)]);
    return new ExerciseDirectory(new Map(found.map((exercise) => [exercise.id, exercise])));
  }

  /** Everything it resolved - what a domain calculation over history takes. */
  get exercises(): Exercise[] {
    return [...this.byId.values()];
  }

  /**
   * The exercise's name, or "Unknown" when the row is gone.
   *
   * History outlives the library: an exercise can be deleted while sets that
   * named it remain, and a past workout is still worth showing. Stating the
   * fallback here is what keeps four read models agreeing on it.
   */
  nameOf(exerciseId: string): string {
    return this.byId.get(exerciseId)?.name ?? 'Unknown';
  }

  /** Decides which measurements a form offers; strength is the safe default. */
  typeOf(exerciseId: string): ExerciseType {
    return this.byId.get(exerciseId)?.exerciseType ?? 'strength';
  }

  /** The equipment an exercise links, for a caller that resolves those too. */
  equipmentIdsOf(exerciseId: string): readonly string[] {
    return this.byId.get(exerciseId)?.equipmentIds ?? [];
  }

  /** Every equipment id any resolved exercise links, deduplicated. */
  get allEquipmentIds(): string[] {
    const ids = new Set<string>();
    for (const exercise of this.byId.values()) {
      for (const id of exercise.equipmentIds) ids.add(id);
    }
    return [...ids];
  }
}
