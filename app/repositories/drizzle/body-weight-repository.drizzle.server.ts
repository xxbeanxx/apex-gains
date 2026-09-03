import { and, desc, eq } from "drizzle-orm";

import { dbScope } from "~/db/index.server";
import { bodyWeightLogs, type BodyWeightLog } from "~/db/schema";
import { BodyWeightEntry } from "~/domain/bodyweight/body-weight-entry";
import type { DateOnly } from "~/domain/values/date-only";

import type { BodyWeightRepository } from "../body-weight-repository.server";

function toEntry(row: BodyWeightLog): BodyWeightEntry {
  return BodyWeightEntry.fromSnapshot({
    id: row.id,
    userId: row.userId,
    date: row.date,
    weight: row.weight,
    createdAt: row.createdAt,
  });
}

export class DrizzleBodyWeightRepository implements BodyWeightRepository {
  async findForDate(
    userId: string,
    date: DateOnly,
  ): Promise<BodyWeightEntry | null> {
    const row = await dbScope.query.bodyWeightLogs.findFirst({
      where: and(
        eq(bodyWeightLogs.userId, userId),
        eq(bodyWeightLogs.date, date.value),
      ),
    });
    return row ? toEntry(row) : null;
  }

  async listRecent(
    userId: string,
    limit: number,
  ): Promise<BodyWeightEntry[]> {
    const rows = await dbScope
      .select()
      .from(bodyWeightLogs)
      .where(eq(bodyWeightLogs.userId, userId))
      .orderBy(desc(bodyWeightLogs.date))
      .limit(limit);
    return rows.map(toEntry);
  }

  /**
   * Upserts on `(userId, date)` rather than on the id: the service loads the
   * day's entry and corrects it, but two requests can still race to log the
   * same day, and the constraint should resolve that as a correction rather
   * than as an error.
   */
  async save(entry: BodyWeightEntry): Promise<void> {
    const snapshot = entry.toSnapshot();
    await dbScope
      .insert(bodyWeightLogs)
      .values(snapshot)
      .onConflictDoUpdate({
        target: [bodyWeightLogs.userId, bodyWeightLogs.date],
        set: { weight: snapshot.weight },
      });
  }

  async delete(entryId: string): Promise<void> {
    await dbScope
      .delete(bodyWeightLogs)
      .where(eq(bodyWeightLogs.id, entryId));
  }
}
