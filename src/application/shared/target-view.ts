import { type MeasurementValues, toValues } from '~application/shared/measurement-values';
import type { AthletePreferences } from '~domain/athlete/preferences';
import type { SetTarget } from '~domain/workout/set-target';

/**
 * A structured target, formatted in the athlete's own units - the shape
 * every card or row that renders one as discrete chips ("3 sets", "8 reps",
 * "135 lb") shares, rather than each read model inventing its own.
 */
export type TargetView = {
  sets: number | null;
  reps: number | null;
  weight: string | null;
  duration: string | null;
  speed: string | null;
  resistance: number | null;
  /**
   * Formatted in minutes, same as `duration` - "1.5 min".
   */
  rest: string | null;
  /**
   * The same target as bare numbers in the athlete's units, keyed as the
   * target form's fields are - an edit form's defaults, an Apply's hidden
   * inputs, and `restSeconds` for the rest timer to count down from.
   */
  values: MeasurementValues;
};

export function toTargetView(target: SetTarget, preferences: AthletePreferences): TargetView | null {
  if (target.isEmpty) {
    return null;
  }

  return {
    sets: target.sets,
    reps: target.reps,
    weight: preferences.formatWeight(target.weight),
    duration: preferences.formatDuration(target.duration),
    speed: preferences.formatSpeed(target.speed),
    resistance: target.resistance,
    rest: preferences.formatDuration(target.rest),
    values: toValues(target, preferences),
  };
}
