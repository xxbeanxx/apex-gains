import type { AthletePreferences } from '~domain/athlete/preferences';
import { Duration } from '~domain/values/duration';
import { Rpe } from '~domain/values/rpe';
import { Speed } from '~domain/values/speed';
import { Weight } from '~domain/values/weight';

export type LoggedSetSnapshot = {
  readonly id: string;
  readonly exerciseId: string;
  readonly setNumber: number;
  readonly reps: number | null;
  readonly weight: string | null;
  readonly durationSeconds: number | null;
  readonly speed: string | null;
  readonly resistanceLevel: number | null;
  readonly notes: string | null;
  readonly rpe: string | null;
  readonly createdAt: Date;
};

export type SetMeasurements = {
  readonly reps?: number | null;
  readonly weight?: Weight | null;
  readonly duration?: Duration | null;
  readonly speed?: Speed | null;
  readonly resistance?: number | null;
  readonly notes?: string | null;
  readonly rpe?: Rpe | null;
};

export type LoggedSetOptions = {
  readonly id: string;
  readonly exerciseId: string;
  readonly setNumber: number;
  readonly reps: number | null;
  readonly weight: Weight | null;
  readonly duration: Duration | null;
  readonly speed: Speed | null;
  readonly resistanceLevel: number | null;
  readonly notes: string | null;
  readonly rpe: Rpe | null;
  readonly createdAt: Date;
};

/**
 * A single set, exactly as performed.
 *
 * One row per set rather than per exercise is what makes pyramids and
 * drop-sets representable, and it is why nothing here is derived from the
 * workout's target: the target only pre-filled the form, and every field
 * was editable before it was submitted.
 */
export class LoggedSet {
  readonly id: string;
  readonly exerciseId: string;
  readonly setNumber: number;
  readonly reps: number | null;
  readonly weight: Weight | null;
  readonly duration: Duration | null;
  readonly speed: Speed | null;
  readonly resistanceLevel: number | null;
  readonly notes: string | null;
  readonly rpe: Rpe | null;
  readonly createdAt: Date;

  private constructor(options: LoggedSetOptions) {
    this.id = options.id;
    this.exerciseId = options.exerciseId;
    this.setNumber = options.setNumber;
    this.reps = options.reps;
    this.weight = options.weight;
    this.duration = options.duration;
    this.speed = options.speed;
    this.resistanceLevel = options.resistanceLevel;
    this.notes = options.notes;
    this.rpe = options.rpe;
    this.createdAt = options.createdAt;
  }

  static of(options: LoggedSetOptions): LoggedSet {
    return new LoggedSet(options);
  }

  static fromSnapshot(snapshot: LoggedSetSnapshot): LoggedSet {
    return LoggedSet.of({
      id: snapshot.id,
      exerciseId: snapshot.exerciseId,
      setNumber: snapshot.setNumber,
      reps: snapshot.reps,
      weight: Weight.fromStorage(snapshot.weight),
      duration: Duration.fromStorage(snapshot.durationSeconds),
      speed: Speed.fromStorage(snapshot.speed),
      resistanceLevel: snapshot.resistanceLevel,
      notes: snapshot.notes,
      rpe: Rpe.fromStorage(snapshot.rpe),
      createdAt: snapshot.createdAt,
    });
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
      notes: this.notes,
      rpe: this.rpe?.toStorage() ?? null,
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

  /** "135 lb x 8 @ RPE 8", "30 min, 8.5 km/h" - one set as a line of text. */
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

    const summary = parts.join(', ');
    if (!this.rpe) return summary;
    return summary ? `${summary} @ ${this.rpe.format()}` : this.rpe.format();
  }
}
