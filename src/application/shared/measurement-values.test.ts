import { describe, expect, it } from 'vitest';

import { toCanonical, toValues } from '~application/shared/measurement-values';
import { AthletePreferences } from '~domain/athlete/preferences';
import { SetTarget } from '~domain/workout/set-target';

const metric = new AthletePreferences('kg', 'km', 'cm', true, 'UTC');
const imperial = new AthletePreferences('lb', 'mi', 'in', true, 'UTC');

describe('toCanonical', () => {
  it("reads each number in the athlete's own units", () => {
    const canonical = toCanonical({ weight: 100, speed: 10, durationMinutes: 20, restSeconds: 90 }, metric);

    expect(canonical.weight?.inKilograms).toBeCloseTo(100, 5);
    expect(canonical.speed?.inKmPerHour).toBeCloseTo(10, 5);
    expect(canonical.duration?.inSeconds).toBe(1200);
    expect(canonical.rest?.inSeconds).toBe(90);

    expect(toCanonical({ weight: 100, speed: 10 }, imperial).weight?.inPounds).toBeCloseTo(100, 5);
    expect(toCanonical({ speed: 10 }, imperial).speed?.inKmPerHour).toBeCloseTo(16.09, 2);
  });

  it('is null for every measurement left blank', () => {
    expect(toCanonical({}, metric)).toEqual({
      sets: null,
      reps: null,
      weight: null,
      duration: null,
      speed: null,
      resistance: null,
      rest: null,
    });
  });
});

describe('toValues', () => {
  /**
   * A target form opens on `toValues` of what was saved and posts back through
   * `toCanonical`, so saving it untouched must change nothing.
   */
  it('gives back what toCanonical was given, in either unit system', () => {
    const typed = { sets: 3, reps: 8, weight: 62.5, durationMinutes: 20, speed: 8.5, resistance: 4, restSeconds: 90 };

    for (const preferences of [metric, imperial]) {
      const saved = SetTarget.of(toCanonical(typed, preferences));
      expect(toValues(saved, preferences)).toEqual(typed);
    }
  });

  it('is null for a measurement the canonical side does not have', () => {
    expect(toValues({ reps: 5 }, metric)).toEqual({
      sets: null,
      reps: 5,
      weight: null,
      durationMinutes: null,
      speed: null,
      resistance: null,
      restSeconds: null,
    });
  });
});
