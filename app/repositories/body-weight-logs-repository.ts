import type { BodyWeightLog } from "~/db/schema";

export type RemoveBodyWeightLogOutcome = "removed" | "not-found";

// Port: consumers depend on this interface, not on Drizzle/Postgres
// directly. See body-weight-logs-repository.server.ts for which adapter
// backs it at runtime.
export interface BodyWeightLogsRepository {
  // Upserts on (userId, date): logging again for a date already logged
  // corrects that day's entry rather than erroring or adding a duplicate.
  logForDate(
    userId: string,
    dateStr: string,
    weight: number,
  ): Promise<BodyWeightLog>;
  listRecentForUser(userId: string, limit: number): Promise<BodyWeightLog[]>;
  removeOwnedByUser(
    userId: string,
    logId: string,
  ): Promise<RemoveBodyWeightLogOutcome>;
}
