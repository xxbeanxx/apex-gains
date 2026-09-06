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
  weightValue: number | null;
  duration: string | null;
  durationMinutesValue: number | null;
  speed: string | null;
  speedValue: number | null;
  resistance: number | null;
  /** Formatted in minutes, same as `duration` - "1.5 min". */
  rest: string | null;
  /** Raw seconds - what the rest timer counts down from. */
  restSeconds: number | null;
};

export function toTargetView(target: SetTarget, preferences: AthletePreferences): TargetView | null {
  if (target.isEmpty) return null;
  return {
    sets: target.sets,
    reps: target.reps,
    weight: preferences.formatWeight(target.weight),
    weightValue: target.weight ? preferences.weightValue(target.weight) : null,
    duration: preferences.formatDuration(target.duration),
    durationMinutesValue: target.duration?.inMinutes ?? null,
    speed: preferences.formatSpeed(target.speed),
    speedValue: target.speed ? preferences.speedValue(target.speed) : null,
    resistance: target.resistance,
    rest: preferences.formatDuration(target.rest),
    restSeconds: target.rest?.inSeconds ?? null,
  };
}
