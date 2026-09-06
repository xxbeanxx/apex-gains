import type { Athlete } from '~domain/athlete/athlete';
import { BodyWeightEntry } from '~domain/body/body-weight-entry';
import { ok, type Result } from '~domain/shared/result';
import type { DateOnly } from '~domain/values/date-only';
import { Weight } from '~domain/values/weight';
import type { BodyWeightRepository } from '~application/ports/persistence/body-weight-repository';
import type { UnitOfWork } from '~application/ports/persistence/unit-of-work';

import type { DomainDeps } from '~application/ports/domain-deps';

/**
 * Recording body weight. Reading it back is `ProgressService`, which shapes
 * it into the same trend series the exercise charts use.
 */
export class BodyWeightService {
  constructor(
    private readonly entries: BodyWeightRepository,
    private readonly unitOfWork: UnitOfWork,
    private readonly deps: DomainDeps,
  ) {}

  /**
   * Logs (or corrects) a day's weight. There is one entry per day, so
   * logging a day again is a correction - the athlete stepping on the scale
   * twice shouldn't produce two truths about the same morning.
   *
   * `weight` arrives in the athlete's chosen unit and is converted to
   * canonical pounds here.
   */
  async record(athlete: Athlete, date: DateOnly, weight: number): Promise<void> {
    const measured = Weight.in(athlete.preferences.weightUnit, weight);

    await this.unitOfWork.run(async () => {
      const existing = await this.entries.findForDate(athlete.id, date);
      if (existing) {
        existing.correctTo(measured);
        await this.entries.save(existing);
        return;
      }

      await this.entries.save(BodyWeightEntry.record(athlete.id, date, measured, this.deps));
    });
  }

  /** Silently ignores an entry that isn't the athlete's, same as a stale form. */
  async remove(athlete: Athlete, date: DateOnly, entryId: string): Promise<Result<void, never>> {
    await this.unitOfWork.run(async () => {
      const entry = await this.entries.findForDate(athlete.id, date);
      if (!entry || entry.id !== entryId) return;
      await this.entries.delete(entry.id);
    });
    return ok();
  }
}
