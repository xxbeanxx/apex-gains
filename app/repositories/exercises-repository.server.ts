import type { Exercise } from '~/domain/exercise/exercise';

/**
 * Deleting a personal exercise fails when a workout or a logged set still
 * points at it - the FKs are `on delete restrict` precisely so history can't
 * be silently rewritten.
 */
export type DeleteExerciseOutcome = 'deleted' | 'in-use';

// Port: consumers depend on this interface, not on Drizzle/Postgres
// directly. `server/repositories/repositories.module.ts` picks which
// adapter backs it.
//
// A plain collection of `Exercise` aggregates: loading, saving and a few
// lookups. The rules - forking a sample on first edit, copying its equipment
// links - belong to the aggregate, not to these methods.
export interface ExercisesRepository {
  /** Own exercises plus, when asked for, samples the user hasn't forked. */
  listFor(userId: string, showSampleData: boolean): Promise<Exercise[]>;
  findById(exerciseId: string): Promise<Exercise | null>;
  /**
   * Exactly these exercises, ignoring visibility.
   *
   * History resolves the exercise behind every logged set, and a set can
   * point at a sample the athlete has since forked away from - which
   * `listFor` deliberately hides, because the fork now stands in for it in
   * their library. Their past sets still belong to the original, so the
   * charts look them up by id instead.
   */
  findManyByIds(exerciseIds: readonly string[]): Promise<Exercise[]>;
  /** The user's own, or a sample - anything they're allowed to act on. */
  findVisible(userId: string, exerciseId: string): Promise<Exercise | null>;
  /** Backs the duplicate-name check; names are unique per user. */
  findOwnByName(userId: string, name: string): Promise<Exercise | null>;
  /**
   * The user's existing fork of a sample, if they already have one. Forking
   * is idempotent, and knowing whether a copy exists is a query, so it stays
   * on this side of the boundary.
   */
  findForkOf(userId: string, sampleId: string): Promise<Exercise | null>;
  save(exercise: Exercise): Promise<void>;
  delete(exerciseId: string): Promise<DeleteExerciseOutcome>;
}
