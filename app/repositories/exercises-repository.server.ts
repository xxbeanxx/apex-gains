import type { ExercisesRepository } from "./exercises-repository";

let repository: ExercisesRepository | undefined;

// Ports and adapters: pick the adapter once per process and cache it, so
// the in-memory adapter's state actually persists across requests. See
// athletes-repository.server.ts for why the adapter modules are imported
// dynamically rather than at the top of this file.
export async function getExercisesRepository(): Promise<ExercisesRepository> {
  if (!repository) {
    repository = process.env.DATABASE_URL
      ? new (
          await import("./exercises-repository.drizzle.server")
        ).DrizzleExercisesRepository()
      : new (
          await import("./exercises-repository.in-memory.server")
        ).InMemoryExercisesRepository();
  }
  return repository;
}
