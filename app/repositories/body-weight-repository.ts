import type { BodyWeightEntry } from "~/domain/bodyweight/body-weight-entry";
import type { DateOnly } from "~/domain/values/date-only";

// Port: consumers depend on this interface, not on Drizzle/Postgres
// directly. See body-weight-repository.server.ts for which adapter backs it
// at runtime.
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
