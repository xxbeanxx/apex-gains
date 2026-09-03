import type { BodyWeightRepository } from "./body-weight-repository";

let repository: BodyWeightRepository | undefined;

// Ports and adapters: pick the adapter once per process and cache it, so
// the in-memory adapter's state actually persists across requests. See
// athletes-repository.server.ts for why the adapter modules are imported
// dynamically rather than at the top of this file.
export async function getBodyWeightRepository(): Promise<BodyWeightRepository> {
  if (!repository) {
    repository = process.env.DATABASE_URL
      ? new (
          await import("./body-weight-repository.drizzle.server")
        ).DrizzleBodyWeightRepository()
      : new (
          await import("./body-weight-repository.in-memory.server")
        ).InMemoryBodyWeightRepository();
  }
  return repository;
}
