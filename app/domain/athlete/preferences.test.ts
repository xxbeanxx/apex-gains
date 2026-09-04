import { describe, expect, it } from 'vitest';

import { Duration } from '../values/duration';
import { Speed } from '../values/speed';
import { Weight } from '../values/weight';
import { AthletePreferences } from './preferences';

describe('defaults', () => {
  it('starts on pounds, kilometres, and sample data shown', () => {
    const preferences = AthletePreferences.defaults();

    expect(preferences.weightUnit).toBe('lb');
    expect(preferences.distanceUnit).toBe('km');
    expect(preferences.showSampleData).toBe(true);
  });
});

describe('withUnits', () => {
  it('changes both units without touching showSampleData', () => {
    const preferences = new AthletePreferences('lb', 'km', false).withUnits('kg', 'mi');

    expect(preferences.weightUnit).toBe('kg');
    expect(preferences.distanceUnit).toBe('mi');
    expect(preferences.showSampleData).toBe(false);
  });
});

describe('withSampleData', () => {
  it('changes only the visibility flag', () => {
    const preferences = new AthletePreferences('kg', 'mi', true).withSampleData(false);

    expect(preferences.showSampleData).toBe(false);
    expect(preferences.weightUnit).toBe('kg');
    expect(preferences.distanceUnit).toBe('mi');
  });
});

describe('formatting', () => {
  it('formats a weight in the preferred unit, and null as null', () => {
    const preferences = new AthletePreferences('kg', 'km', true);

    expect(preferences.formatWeight(Weight.lb(100))).toBe('45.4 kg');
    expect(preferences.formatWeight(null)).toBeNull();
  });

  it('formats a speed in the preferred distance unit, and null as null', () => {
    const preferences = new AthletePreferences('lb', 'mi', true);

    expect(preferences.formatSpeed(Speed.kmh(16.09))).toBe('10 mph');
    expect(preferences.formatSpeed(null)).toBeNull();
  });

  it('formats a duration regardless of unit preferences, and null as null', () => {
    const preferences = new AthletePreferences('lb', 'km', true);

    expect(preferences.formatDuration(Duration.minutes(30))).toBe('30 min');
    expect(preferences.formatDuration(null)).toBeNull();
  });

  it('exposes the bare numeric value for a chart axis', () => {
    const preferences = new AthletePreferences('kg', 'km', true);
    expect(preferences.weightValue(Weight.lb(100))).toBeCloseTo(45.36, 2);
  });
});
