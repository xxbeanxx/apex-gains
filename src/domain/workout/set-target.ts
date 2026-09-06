import type { AthletePreferences } from '../athlete/preferences';
import { Duration } from '../values/duration';
import { Speed } from '../values/speed';
import { Weight } from '../values/weight';

export type SetTargetSnapshot = {
  readonly targetSets: number | null;
  readonly targetReps: number | null;
  readonly targetWeight: string | null;
  readonly targetDurationSeconds: number | null;
  readonly targetSpeed: string | null;
  readonly targetResistance: number | null;
  readonly targetRestSeconds: number | null;
};

export type SetTargetInput = {
  readonly sets?: number | null;
  readonly reps?: number | null;
  readonly weight?: Weight | null;
  readonly duration?: Duration | null;
  readonly speed?: Speed | null;
  readonly resistance?: number | null;
  readonly rest?: Duration | null;
};

/**
 * What a workout suggests for an exercise: six nullable columns that only
 * mean anything together.
 *
 * Targets pre-fill the logging form and nothing more - every field stays
 * editable per set, and a logged set is never validated against its target
 * (see CLAUDE.md's domain model note). So this deliberately has no
 * "did you hit it" behaviour; it formats itself and that is all.
 */
export class SetTarget {
  private constructor(
    readonly sets: number | null,
    readonly reps: number | null,
    readonly weight: Weight | null,
    readonly duration: Duration | null,
    readonly speed: Speed | null,
    readonly resistance: number | null,
    readonly rest: Duration | null,
  ) {}

  static none(): SetTarget {
    return new SetTarget(null, null, null, null, null, null, null);
  }

  static of(input: SetTargetInput): SetTarget {
    return new SetTarget(
      input.sets ?? null,
      input.reps ?? null,
      input.weight ?? null,
      input.duration ?? null,
      input.speed ?? null,
      input.resistance ?? null,
      input.rest ?? null,
    );
  }

  static fromSnapshot(snapshot: SetTargetSnapshot): SetTarget {
    return new SetTarget(
      snapshot.targetSets,
      snapshot.targetReps,
      Weight.fromStorage(snapshot.targetWeight),
      Duration.fromStorage(snapshot.targetDurationSeconds),
      Speed.fromStorage(snapshot.targetSpeed),
      snapshot.targetResistance,
      Duration.fromStorage(snapshot.targetRestSeconds),
    );
  }

  toSnapshot(): SetTargetSnapshot {
    return {
      targetSets: this.sets,
      targetReps: this.reps,
      targetWeight: this.weight?.toStorage() ?? null,
      targetDurationSeconds: this.duration?.toStorage() ?? null,
      targetSpeed: this.speed?.toStorage() ?? null,
      targetResistance: this.resistance,
      targetRestSeconds: this.rest?.toStorage() ?? null,
    };
  }

  get isEmpty(): boolean {
    return (
      this.sets === null &&
      this.reps === null &&
      this.weight === null &&
      this.duration === null &&
      this.speed === null &&
      this.resistance === null &&
      this.rest === null
    );
  }

  /**
   * "3 x 10, 135 lb" / "30 min, 8.5 km/h" - the one-line summary shown under
   * an exercise on /today and in the workout editor. Returns null when
   * there is nothing to suggest, so the caller can omit the line entirely.
   */
  format(preferences: AthletePreferences): string | null {
    const parts: string[] = [];

    if (this.sets !== null && this.reps !== null) {
      parts.push(`${this.sets} x ${this.reps}`);
    } else if (this.reps !== null) {
      parts.push(`${this.reps} reps`);
    } else if (this.sets !== null) {
      parts.push(`${this.sets} sets`);
    }

    const weight = preferences.formatWeight(this.weight);
    if (weight) parts.push(weight);

    const duration = preferences.formatDuration(this.duration);
    if (duration) parts.push(duration);

    const speed = preferences.formatSpeed(this.speed);
    if (speed) parts.push(speed);

    if (this.resistance !== null) parts.push(`resistance ${this.resistance}`);

    const rest = preferences.formatDuration(this.rest);
    if (rest) parts.push(`${rest} rest`);

    return parts.length > 0 ? parts.join(', ') : null;
  }
}
