import { and, desc, eq } from 'drizzle-orm';

import { dbScope } from '~/db/index.server';
import { bodyMeasurements, type BodyMeasurement as BodyMeasurementRow } from '~/db/schema';
import { BodyMeasurement, type BodyMeasurementMetric } from '~/domain/body/body-measurement';
import type { DateOnly } from '~/domain/values/date-only';

import type { BodyMeasurementsRepository } from '../body-measurements-repository.server';

function toEntry(row: BodyMeasurementRow): BodyMeasurement {
  return BodyMeasurement.fromSnapshot({
    id: row.id,
    userId: row.userId,
    date: row.date,
    metric: row.metric,
    value: row.value,
    createdAt: row.createdAt,
  });
}

export class DrizzleBodyMeasurementsRepository implements BodyMeasurementsRepository {
  async findForDate(userId: string, date: DateOnly, metric: BodyMeasurementMetric): Promise<BodyMeasurement | null> {
    const row = await dbScope.query.bodyMeasurements.findFirst({
      where: and(
        eq(bodyMeasurements.userId, userId),
        eq(bodyMeasurements.date, date.value),
        eq(bodyMeasurements.metric, metric),
      ),
    });
    return row ? toEntry(row) : null;
  }

  async listRecent(userId: string, metric: BodyMeasurementMetric, limit: number): Promise<BodyMeasurement[]> {
    const rows = await dbScope
      .select()
      .from(bodyMeasurements)
      .where(and(eq(bodyMeasurements.userId, userId), eq(bodyMeasurements.metric, metric)))
      .orderBy(desc(bodyMeasurements.date))
      .limit(limit);
    return rows.map(toEntry);
  }

  async listAll(userId: string): Promise<BodyMeasurement[]> {
    const rows = await dbScope
      .select()
      .from(bodyMeasurements)
      .where(eq(bodyMeasurements.userId, userId))
      .orderBy(desc(bodyMeasurements.date));
    return rows.map(toEntry);
  }

  /**
   * Upserts on `(userId, date, metric)` rather than on the id: the service
   * loads the day's entry for the metric and corrects it, but two requests
   * can still race to log the same day, and the constraint should resolve
   * that as a correction rather than as an error.
   */
  async save(entry: BodyMeasurement): Promise<void> {
    const snapshot = entry.toSnapshot();
    await dbScope
      .insert(bodyMeasurements)
      .values(snapshot)
      .onConflictDoUpdate({
        target: [bodyMeasurements.userId, bodyMeasurements.date, bodyMeasurements.metric],
        set: { value: snapshot.value },
      });
  }

  async delete(entryId: string): Promise<void> {
    await dbScope.delete(bodyMeasurements).where(eq(bodyMeasurements.id, entryId));
  }
}
