import type { LoggedSet } from "~/domain/session/logged-set";
import type { WorkoutSession } from "~/domain/session/workout-session";
import type { DateOnly } from "~/domain/values/date-only";

// Port: consumers depend on this interface, not on Drizzle/Postgres
// directly. The factory below picks which adapter backs it at runtime.
export interface WorkoutSessionsRepository {
  findForDate(userId: string, date: DateOnly): Promise<WorkoutSession | null>;
  /**
   * Inserts a newly opened session, or returns the one that already exists
   * for that day.
   *
   * Opening a day is idempotent, and two requests can race to do it - the
   * `(userId, date)` unique constraint is what settles that, so the adapter
   * resolves the conflict rather than callers taking a lock.
   */
  add(session: WorkoutSession): Promise<WorkoutSession>;
  listRecent(userId: string, limit: number): Promise<WorkoutSession[]>;
  listForDateRange(
    userId: string,
    start: DateOnly,
    endExclusive: DateOnly,
  ): Promise<WorkoutSession[]>;
  /**
   * The most recently logged sets for one exercise, newest first, across
   * every session - what "last time I did this" shows.
   */
  recentSetsForExercise(
    userId: string,
    exerciseId: string,
    limit: number,
  ): Promise<{ date: DateOnly; set: LoggedSet }[]>;
  save(session: WorkoutSession): Promise<void>;
}

let repository: WorkoutSessionsRepository | undefined;

// Ports and adapters: pick the adapter once per process and cache it, so
// the in-memory adapter's state actually persists across requests. See
// athletes-repository.server.ts for why the adapter modules are imported
// dynamically rather than at the top of this file.
export async function getWorkoutSessionsRepository(): Promise<WorkoutSessionsRepository> {
  if (!repository) {
    repository = process.env.DATABASE_URL
      ? new (
          await import("./drizzle/workout-sessions-repository.server")
        ).DrizzleWorkoutSessionsRepository()
      : new (
          await import(
            "./in-memory/workout-sessions-repository.server"
          )
        ).InMemoryWorkoutSessionsRepository();
  }
  return repository;
}
