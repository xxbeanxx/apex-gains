import type { TemplatesRepository } from "./templates-repository";

let repository: TemplatesRepository | undefined;

// Ports and adapters: pick the adapter once per process and cache it, so
// the in-memory adapter's state actually persists across requests. See
// athletes-repository.server.ts for why the adapter modules are imported
// dynamically rather than at the top of this file.
export async function getTemplatesRepository(): Promise<TemplatesRepository> {
  if (!repository) {
    repository = process.env.DATABASE_URL
      ? new (
          await import("./templates-repository.drizzle.server")
        ).DrizzleTemplatesRepository()
      : new (
          await import("./templates-repository.in-memory.server")
        ).InMemoryTemplatesRepository();
  }
  return repository;
}
