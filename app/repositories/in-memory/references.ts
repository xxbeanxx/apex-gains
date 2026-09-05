/**
 * The two things Postgres does for these adapters that a `Map` does not.
 *
 * Every in-memory store is separate and holds no foreign keys, so on its own
 * it will happily delete a row the real schema refuses to delete, and leave
 * behind rows the real schema would have cascaded away. Both differences are
 * invisible until the day a service test passes against the in-memory store
 * and the same code fails against Postgres.
 *
 * So the stores that reference another are named to it at construction
 * (`server/repositories/repositories.module.ts` and the contract's own
 * wiring), and the adapter asks them rather than guessing.
 */

/** Implemented by a store holding rows with an `on delete restrict` FK to an exercise. */
export interface ExerciseReferences {
  /** Whether anything in this store still points at the exercise. */
  referencesExercise(exerciseId: string): boolean;
}

/** Implemented by a store whose rows hang off `users` with `on delete cascade`. */
export interface AthleteOwned {
  /** Drops everything this store holds for the athlete. */
  removeAllFor(userId: string): void;
}
