import type { AthletePreferences } from '../athlete/preferences';
import { Duration } from '../values/duration';
import { Speed } from '../values/speed';
import { Weight } from '../values/weight';

export type LoggedSetSnapshot = {
  readonly id: string;
  readonly exerciseId: string;
  readonly setNumber: number;
  readonly reps: number | null;
  readonly weight: string | null;
  readonly durationSeconds: number | null;
  readonly speed: string | null;
  readonly resistanceLevel: number | null;
  readonly createdAt: Date;
};

export type SetMeasurements = {
  readonly reps?: number | null;
  readonly weight?: Weight | null;
  readonly duration?: Duration | null;
  readonly speed?: Speed | null;
  readonly resistance?: number | null;
};

/**
 * A single set, exactly as performed.
 *
 * One row per set rather than per exercise is what makes pyramids and
 * drop-sets representable, and it is why nothing here is derived from the
 * template's target: the target only pre-filled the form, and every field
 * was editable before it was submitted.
 */
export class LoggedSet {
  constructor(
    readonly id: string,
    readonly exerciseId: string,
    readonly setNumber: number,
    readonly reps: number | null,
    readonly weight: Weight | null,
    readonly duration: Duration | null,
    readonly speed: Speed | null,
    readonly resistanceLevel: number | null,
    readonly createdAt: Date,
  ) {}

  static fromSnapshot(snapshot: LoggedSetSnapshot): LoggedSet {
    return new LoggedSet(
      snapshot.id,
      snapshot.exerciseId,
      snapshot.setNumber,
      snapshot.reps,
      Weight.fromStorage(snapshot.weight),
      Duration.fromStorage(snapshot.durationSeconds),
      Speed.fromStorage(snapshot.speed),
      snapshot.resistanceLevel,
      snapshot.createdAt,
    );
  }

  toSnapshot(): LoggedSetSnapshot {
    return {
      id: this.id,
      exerciseId: this.exerciseId,
      setNumber: this.setNumber,
      reps: this.reps,
      weight: this.weight?.toStorage() ?? null,
      durationSeconds: this.duration?.toStorage() ?? null,
      speed: this.speed?.toStorage() ?? null,
      resistanceLevel: this.resistanceLevel,
      createdAt: this.createdAt,
    };
  }

  /**
   * Weight moved by this set. Bodyweight-only and cardio sets have no weight
   * to count and contribute nothing, rather than being guessed at.
   */
  get tonnage(): Weight | null {
    if (!this.weight || this.reps === null) return null;
    return this.weight.times(this.reps);
  }

  /** "135 lb x 8", "30 min, 8.5 km/h" - one set as a line of text. */
  format(preferences: AthletePreferences): string {
    const parts: string[] = [];

    const weight = preferences.formatWeight(this.weight);
    if (weight && this.reps !== null) parts.push(`${weight} x ${this.reps}`);
    else if (weight) parts.push(weight);
    else if (this.reps !== null) parts.push(`${this.reps} reps`);

    const duration = preferences.formatDuration(this.duration);
    if (duration) parts.push(duration);

    const speed = preferences.formatSpeed(this.speed);
    if (speed) parts.push(speed);

    if (this.resistanceLevel !== null) {
      parts.push(`resistance ${this.resistanceLevel}`);
    }

    return parts.join(', ');
  }
}
