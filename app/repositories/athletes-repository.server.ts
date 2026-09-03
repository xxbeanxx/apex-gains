import type { AthletesRepository } from "./athletes-repository";

let repository: AthletesRepository | undefined;

// Ports and adapters: pick the adapter once per process and cache it, so
// the in-memory adapter's state actually persists across requests. The
// adapter modules are imported dynamically (rather than at the top of this
// file) so that importing this factory never pulls in ~/db/index.server -
// which throws at import time when DATABASE_URL is unset - unless a
// database is actually configured.
export async function getAthletesRepository(): Promise<AthletesRepository> {
  if (!repository) {
    repository = process.env.DATABASE_URL
      ? new (
          await import("./athletes-repository.drizzle.server")
        ).DrizzleAthletesRepository()
      : new (
          await import("./athletes-repository.in-memory.server")
        ).InMemoryAthletesRepository();
  }
  return repository;
}
