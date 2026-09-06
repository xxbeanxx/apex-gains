import type { DomainDeps } from '~application/ports/domain-deps';
import type { BodyMeasurementsRepository } from '~application/ports/persistence/body-measurements-repository';
import type { UnitOfWork } from '~application/ports/persistence/unit-of-work';
import type { Athlete } from '~domain/athlete/athlete';
import { BodyMeasurement, type BodyMeasurementMetric } from '~domain/body/body-measurement';
import { type Result, ok } from '~domain/shared/result';
import type { DateOnly } from '~domain/values/date-only';
import { Length } from '~domain/values/length';

/**
 * Recording body measurements (waist, chest, ...). Reading them back is
 * `ProgressService`, which shapes each metric into the same trend series the
 * exercise charts use.
 */
export class BodyMeasurementsService {
  constructor(
    private readonly entries: BodyMeasurementsRepository,
    private readonly unitOfWork: UnitOfWork,
    private readonly deps: DomainDeps,
  ) {}

  /**
   * Logs (or corrects) a metric for a day. There is one entry per
   * `(day, metric)`, so logging one again is a correction - measuring twice
   * shouldn't produce two truths about the same day.
   *
   * `value` arrives in the athlete's chosen length unit and is converted to
   * canonical centimetres here.
   */
  async record(athlete: Athlete, date: DateOnly, metric: BodyMeasurementMetric, value: number): Promise<void> {
    const measured = Length.of(athlete.preferences.lengthUnit, value);

    await this.unitOfWork.run(async () => {
      const existing = await this.entries.findForDate(athlete.id, date, metric);
      if (existing) {
        existing.correctTo(measured);
        await this.entries.save(existing);
        return;
      }

      await this.entries.save(BodyMeasurement.record(athlete.id, date, metric, measured, this.deps));
    });
  }

  /** Silently ignores an entry that isn't the athlete's, same as a stale form. */
  async remove(athlete: Athlete, date: DateOnly, metric: BodyMeasurementMetric, entryId: string): Promise<Result<void, never>> {
    await this.unitOfWork.run(async () => {
      const entry = await this.entries.findForDate(athlete.id, date, metric);
      if (!entry || entry.id !== entryId) return;
      await this.entries.delete(entry.id);
    });
    return ok();
  }
}
