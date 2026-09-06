import type { Clock } from '../shared/clock';
import type { IdGenerator } from '../shared/ids';
import { DateOnly } from '../values/date-only';
import { Length } from '../values/length';

/**
 * Which part of the body a measurement is of. A Postgres enum, not free
 * text: free text lets "waist" and "Waist " differ by whitespace and
 * quietly become two series on the chart.
 */
export const BODY_MEASUREMENT_METRICS = ['waist', 'chest', 'arm_left', 'arm_right', 'thigh', 'hips', 'neck'] as const;
export type BodyMeasurementMetric = (typeof BODY_MEASUREMENT_METRICS)[number];

export type BodyMeasurementSnapshot = {
  readonly id: string;
  readonly userId: string;
  readonly date: string;
  readonly metric: BodyMeasurementMetric;
  readonly value: string;
  readonly createdAt: Date;
};

/**
 * One day's measurement of one part of the body.
 *
 * Deliberately its own table rather than folded into `body_weight_logs`:
 * that would put a `Weight`-or-`Length` union in one `numeric` column and
 * force every reader to branch on `metric` before it knows what the number
 * even means. This mirrors `BodyWeightEntry` exactly otherwise - the
 * `(userId, date, metric)` unique constraint is what makes re-logging a day
 * a correction rather than a duplicate, same as `correctTo` there.
 */
export class BodyMeasurement {
  private constructor(
    readonly id: string,
    readonly userId: string,
    readonly date: DateOnly,
    readonly metric: BodyMeasurementMetric,
    private measured: Length,
    readonly createdAt: Date,
  ) {}

  static record(
    userId: string,
    date: DateOnly,
    metric: BodyMeasurementMetric,
    value: Length,
    deps: { ids: IdGenerator; clock: Clock },
  ): BodyMeasurement {
    return new BodyMeasurement(deps.ids.next(), userId, date, metric, value, deps.clock.now());
  }

  static fromSnapshot(snapshot: BodyMeasurementSnapshot): BodyMeasurement {
    return new BodyMeasurement(
      snapshot.id,
      snapshot.userId,
      DateOnly.parse(snapshot.date),
      snapshot.metric,
      Length.fromStorage(snapshot.value) ?? Length.cm(0),
      snapshot.createdAt,
    );
  }

  toSnapshot(): BodyMeasurementSnapshot {
    return {
      id: this.id,
      userId: this.userId,
      date: this.date.value,
      metric: this.metric,
      value: this.measured.toStorage(),
      createdAt: this.createdAt,
    };
  }

  get value(): Length {
    return this.measured;
  }

  correctTo(value: Length): void {
    this.measured = value;
  }

  isOwnedBy(userId: string): boolean {
    return this.userId === userId;
  }
}
