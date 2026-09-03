import type { RoutinesRepository } from "./routines-repository";
import { getTemplatesRepository } from "./templates-repository.server";

let repository: RoutinesRepository | undefined;

// Ports and adapters: pick the adapter once per process and cache it, so
// the in-memory adapter's state actually persists across requests. See
// users-repository.server.ts for why the adapter modules are imported
// dynamically rather than at the top of this file.
//
// The in-memory adapter is built on top of getTemplatesRepository() (rather
// than constructing its own template lookup) so that routine slots
// referencing a template see the same template data the templates
// repository has.
export async function getRoutinesRepository(): Promise<RoutinesRepository> {
  if (!repository) {
    repository = process.env.DATABASE_URL
      ? new (
          await import("./routines-repository.drizzle.server")
        ).DrizzleRoutinesRepository()
      : new (
          await import("./routines-repository.in-memory.server")
        ).InMemoryRoutinesRepository(await getTemplatesRepository());
  }
  return repository;
}
