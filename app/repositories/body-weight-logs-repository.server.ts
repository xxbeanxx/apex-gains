import type { BodyWeightLogsRepository } from "./body-weight-logs-repository";

let repository: BodyWeightLogsRepository | undefined;

// Ports and adapters: pick the adapter once per process and cache it, so
// the in-memory adapter's state actually persists across requests. See
// users-repository.server.ts for why the adapter modules are imported
// dynamically rather than at the top of this file.
export async function getBodyWeightLogsRepository(): Promise<BodyWeightLogsRepository> {
  if (!repository) {
    repository = process.env.DATABASE_URL
      ? new (
          await import("./body-weight-logs-repository.drizzle.server")
        ).DrizzleBodyWeightLogsRepository()
      : new (
          await import("./body-weight-logs-repository.in-memory.server")
        ).InMemoryBodyWeightLogsRepository();
  }
  return repository;
}
