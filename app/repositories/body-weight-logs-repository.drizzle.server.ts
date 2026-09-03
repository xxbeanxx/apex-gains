import { and, desc, eq } from "drizzle-orm";

import { db } from "~/db/index.server";
import { bodyWeightLogs } from "~/db/schema";

import type {
  BodyWeightLogsRepository,
  RemoveBodyWeightLogOutcome,
} from "./body-weight-logs-repository";

export class DrizzleBodyWeightLogsRepository
  implements BodyWeightLogsRepository
{
  async logForDate(userId: string, dateStr: string, weight: number) {
    const [log] = await db
      .insert(bodyWeightLogs)
      .values({ userId, date: dateStr, weight: String(weight) })
      .onConflictDoUpdate({
        target: [bodyWeightLogs.userId, bodyWeightLogs.date],
        set: { weight: String(weight) },
      })
      .returning();
    return log;
  }

  async listRecentForUser(userId: string, limit: number) {
    return db
      .select()
      .from(bodyWeightLogs)
      .where(eq(bodyWeightLogs.userId, userId))
      .orderBy(desc(bodyWeightLogs.date))
      .limit(limit);
  }

  async removeOwnedByUser(
    userId: string,
    logId: string,
  ): Promise<RemoveBodyWeightLogOutcome> {
    const deleted = await db
      .delete(bodyWeightLogs)
      .where(
        and(eq(bodyWeightLogs.id, logId), eq(bodyWeightLogs.userId, userId)),
      )
      .returning({ id: bodyWeightLogs.id });
    return deleted.length > 0 ? "removed" : "not-found";
  }
}
