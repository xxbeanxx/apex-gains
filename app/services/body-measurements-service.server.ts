import { Inject, Injectable } from '@nestjs/common';

import type { Athlete } from '~/domain/athlete/athlete';
import { BodyMeasurement, type BodyMeasurementMetric } from '~/domain/body/body-measurement';
import { ok, type Result } from '~/domain/shared/result';
import type { DateOnly } from '~/domain/values/date-only';
import { Length } from '~/domain/values/length';
import type { BodyMeasurementsRepository } from '~/repositories/body-measurements-repository.server';
import type { UnitOfWork } from '~/repositories/unit-of-work.server';
import { BODY_MEASUREMENTS_REPOSITORY, UNIT_OF_WORK } from '~/repositories/tokens';
import { DOMAIN_DEPS } from '~/services/shared/tokens';

import type { DomainDeps } from './shared/deps.server';

/**
 * Recording body measurements (waist, chest, ...). Reading them back is
 * `ProgressService`, which shapes each metric into the same trend series the
 * exercise charts use.
 */
@Injectable()
export class BodyMeasurementsService {
  constructor(
    @Inject(BODY_MEASUREMENTS_REPOSITORY)
    private readonly entries: BodyMeasurementsRepository,
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: UnitOfWork,
    @Inject(DOMAIN_DEPS) private readonly deps: DomainDeps,
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
