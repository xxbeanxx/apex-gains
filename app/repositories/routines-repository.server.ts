import type { RoutinesRepository } from "./routines-repository";

let repository: RoutinesRepository | undefined;

// Ports and adapters: pick the adapter once per process and cache it, so
// the in-memory adapter's state actually persists across requests. See
// athletes-repository.server.ts for why the adapter modules are imported
// dynamically rather than at the top of this file.
export async function getRoutinesRepository(): Promise<RoutinesRepository> {
  if (!repository) {
    repository = process.env.DATABASE_URL
      ? new (
          await import("./drizzle/routines-repository.drizzle.server")
        ).DrizzleRoutinesRepository()
      : new (
          await import("./in-memory/routines-repository.in-memory.server")
        ).InMemoryRoutinesRepository();
  }
  return repository;
}
