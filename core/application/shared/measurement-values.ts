import type { AthletePreferences } from '~domain/athlete/preferences';
import { Duration } from '~domain/values/duration';
import { Speed } from '~domain/values/speed';
import { Weight } from '~domain/values/weight';

/**
 * A target's or a set's measurements as the athlete reads and writes them:
 * weight in their weight unit, speed in their distance unit per hour,
 * duration in minutes, rest in seconds, the counts as they are.
 *
 * The keys are the form fields' names too - a form posts these, its DTO
 * validates these, and a view hands these back as a form's defaults - so the
 * one list of names is stated here rather than per form.
 */
export type MeasurementValues = {
  readonly sets: number | null;
  readonly reps: number | null;
  readonly weight: number | null;
  readonly durationMinutes: number | null;
  readonly speed: number | null;
  readonly resistance: number | null;
  readonly restSeconds: number | null;
};

export type MeasurementName = keyof MeasurementValues;

/**
 * What a form submits: any of the values, each possibly left blank.
 */
export type MeasurementInput = { readonly [K in MeasurementName]?: number | null };

/**
 * The same measurements in canonical units - the shape `SetTarget.of` takes,
 * and `Session.logSet` takes all but `sets` and `rest` of.
 */
export type CanonicalMeasurements = {
  readonly sets: number | null;
  readonly reps: number | null;
  readonly weight: Weight | null;
  readonly duration: Duration | null;
  readonly speed: Speed | null;
  readonly resistance: number | null;
  readonly rest: Duration | null;
};

/**
 * Athlete units in, canonical units out - the only place a number off a form
 * becomes a `Weight`, `Speed` or `Duration`.
 */
export function toCanonical(input: MeasurementInput, preferences: AthletePreferences): CanonicalMeasurements {
  return {
    sets: input.sets ?? null,
    reps: input.reps ?? null,
    weight: input.weight != null ? Weight.in(preferences.weightUnit, input.weight) : null,
    duration: input.durationMinutes != null ? Duration.minutes(input.durationMinutes) : null,
    speed: input.speed != null ? Speed.in(preferences.distanceUnit, input.speed) : null,
    resistance: input.resistance ?? null,
    rest: input.restSeconds != null ? Duration.seconds(input.restSeconds) : null,
  };
}

/**
 * Canonical units in, athlete units out - the inverse of `toCanonical`, for a
 * form's defaults. A measurement not given comes back null.
 */
export function toValues(
  canonical: { readonly [K in keyof CanonicalMeasurements]?: CanonicalMeasurements[K] },
  preferences: AthletePreferences,
): MeasurementValues {
  return {
    sets: canonical.sets ?? null,
    reps: canonical.reps ?? null,
    weight: canonical.weight ? preferences.weightValue(canonical.weight) : null,
    durationMinutes: canonical.duration?.inMinutes ?? null,
    speed: canonical.speed ? preferences.speedValue(canonical.speed) : null,
    resistance: canonical.resistance ?? null,
    restSeconds: canonical.rest?.inSeconds ?? null,
  };
}
