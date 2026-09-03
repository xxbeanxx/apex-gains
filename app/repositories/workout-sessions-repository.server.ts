import { getExercisesRepository } from "./exercises-repository.server";
import type { WorkoutSessionsRepository } from "./workout-sessions-repository";

let repository: WorkoutSessionsRepository | undefined;

// Ports and adapters: pick the adapter once per process and cache it, so
// the in-memory adapter's state actually persists across requests. See
// users-repository.server.ts for why the adapter modules are imported
// dynamically rather than at the top of this file.
export async function getWorkoutSessionsRepository(): Promise<WorkoutSessionsRepository> {
  if (!repository) {
    repository = process.env.DATABASE_URL
      ? new (
          await import("./workout-sessions-repository.drizzle.server")
        ).DrizzleWorkoutSessionsRepository()
      : new (
          await import("./workout-sessions-repository.in-memory.server")
        ).InMemoryWorkoutSessionsRepository(await getExercisesRepository());
  }
  return repository;
}
