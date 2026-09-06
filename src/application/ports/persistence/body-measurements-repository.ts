import type { BodyMeasurement, BodyMeasurementMetric } from '~domain/body/body-measurement';
import type { DateOnly } from '~domain/values/date-only';

// Port: consumers depend on this interface, not on Drizzle/Postgres
// directly. `server/repositories/repositories.module.ts` picks which
// adapter backs it.
export interface BodyMeasurementsRepository {
  /**
   * There is at most one entry per `(userId, date, metric)` - which is what
   * makes re-logging a metric on a day a correction rather than a
   * duplicate, same as `BodyWeightRepository.findForDate`.
   */
  findForDate(userId: string, date: DateOnly, metric: BodyMeasurementMetric): Promise<BodyMeasurement | null>;
  listRecent(userId: string, metric: BodyMeasurementMetric, limit: number): Promise<BodyMeasurement[]>;
  /** Every entry an athlete has ever logged, across every metric, newest first, uncapped - what an export needs instead of the chart's bounded window. */
  listAll(userId: string): Promise<BodyMeasurement[]>;
  save(entry: BodyMeasurement): Promise<void>;
  delete(entryId: string): Promise<void>;
}
