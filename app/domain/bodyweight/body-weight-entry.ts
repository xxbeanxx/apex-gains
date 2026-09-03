import type { Clock } from "../shared/clock";
import type { IdGenerator } from "../shared/ids";
import { DateOnly } from "../values/date-only";
import { Weight } from "../values/weight";

export type BodyWeightEntrySnapshot = {
  readonly id: string;
  readonly userId: string;
  readonly date: string;
  readonly weight: string;
  readonly createdAt: Date;
};

/**
 * One day's body weight.
 *
 * Its own small aggregate rather than part of `Athlete`: entries accumulate
 * indefinitely and are read a few hundred at a time for the trend chart, so
 * loading them alongside the athlete on every request would be wasteful. The
 * `(userId, date)` unique constraint makes re-logging a day a correction
 * rather than a duplicate, which `correctTo` expresses.
 */
export class BodyWeightEntry {
  private constructor(
    readonly id: string,
    readonly userId: string,
    readonly date: DateOnly,
    private measured: Weight,
    readonly createdAt: Date,
  ) {}

  static record(
    userId: string,
    date: DateOnly,
    weight: Weight,
    deps: { ids: IdGenerator; clock: Clock },
  ): BodyWeightEntry {
    return new BodyWeightEntry(
      deps.ids.next(),
      userId,
      date,
      weight,
      deps.clock.now(),
    );
  }

  static fromSnapshot(snapshot: BodyWeightEntrySnapshot): BodyWeightEntry {
    return new BodyWeightEntry(
      snapshot.id,
      snapshot.userId,
      DateOnly.parse(snapshot.date),
      Weight.fromStorage(snapshot.weight) ?? Weight.lb(0),
      snapshot.createdAt,
    );
  }

  toSnapshot(): BodyWeightEntrySnapshot {
    return {
      id: this.id,
      userId: this.userId,
      date: this.date.value,
      weight: this.measured.toStorage(),
      createdAt: this.createdAt,
    };
  }

  get weight(): Weight {
    return this.measured;
  }

  correctTo(weight: Weight): void {
    this.measured = weight;
  }

  isOwnedBy(userId: string): boolean {
    return this.userId === userId;
  }
}
