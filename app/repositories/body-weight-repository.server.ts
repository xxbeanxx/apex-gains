import type { BodyWeightEntry } from "~/domain/bodyweight/body-weight-entry";
import type { DateOnly } from "~/domain/values/date-only";

// Port: consumers depend on this interface, not on Drizzle/Postgres
// directly. The factory below picks which adapter backs it at runtime.
export interface BodyWeightRepository {
  /**
   * There is at most one entry per day (the `(userId, date)` unique
   * constraint), which is what makes re-logging a day a correction rather
   * than a duplicate - the service loads the day's entry and corrects it.
   */
  findForDate(userId: string, date: DateOnly): Promise<BodyWeightEntry | null>;
  listRecent(userId: string, limit: number): Promise<BodyWeightEntry[]>;
  save(entry: BodyWeightEntry): Promise<void>;
  delete(entryId: string): Promise<void>;
}

let repository: BodyWeightRepository | undefined;

// Ports and adapters: pick the adapter once per process and cache it, so
// the in-memory adapter's state actually persists across requests. See
// athletes-repository.server.ts for why the adapter modules are imported
// dynamically rather than at the top of this file.
export async function getBodyWeightRepository(): Promise<BodyWeightRepository> {
  if (!repository) {
    repository = process.env.DATABASE_URL
      ? new (
          await import("./drizzle/body-weight-repository.server")
        ).DrizzleBodyWeightRepository()
      : new (
          await import("./in-memory/body-weight-repository.server")
        ).InMemoryBodyWeightRepository();
  }
  return repository;
}
