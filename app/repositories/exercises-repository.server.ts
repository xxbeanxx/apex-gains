import type { Exercise } from "~/domain/exercise/exercise";

/**
 * Deleting a personal exercise fails when a template or a logged set still
 * points at it - the FKs are `on delete restrict` precisely so history can't
 * be silently rewritten.
 */
export type DeleteExerciseOutcome = "deleted" | "in-use";

// Port: consumers depend on this interface, not on Drizzle/Postgres
// directly. The factory below picks which adapter backs it at runtime.
//
// Now a plain collection of `Exercise` aggregates: loading, saving and a few
// lookups. The rules these methods used to carry - forking a sample on first
// edit, copying its equipment links - moved onto the aggregate itself, so
// they are stated once instead of once per adapter.
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

let repository: ExercisesRepository | undefined;

// Ports and adapters: pick the adapter once per process and cache it, so
// the in-memory adapter's state actually persists across requests. See
// athletes-repository.server.ts for why the adapter modules are imported
// dynamically rather than at the top of this file.
export async function getExercisesRepository(): Promise<ExercisesRepository> {
  if (!repository) {
    repository = process.env.DATABASE_URL
      ? new (
          await import("./drizzle/exercises-repository.server")
        ).DrizzleExercisesRepository()
      : new (
          await import("./in-memory/exercises-repository.server")
        ).InMemoryExercisesRepository();
  }
  return repository;
}
