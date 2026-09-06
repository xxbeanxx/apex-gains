import { describe, expect, it } from 'vitest';

import { Duration } from '../values/duration';
import { Speed } from '../values/speed';
import { Weight } from '../values/weight';
import { AthletePreferences } from './preferences';

describe('defaults', () => {
  it('starts on pounds, kilometres, sample data shown, and UTC', () => {
    const preferences = AthletePreferences.defaults();

    expect(preferences.weightUnit).toBe('lb');
    expect(preferences.distanceUnit).toBe('km');
    expect(preferences.showSampleData).toBe(true);
    expect(preferences.timezone).toBe('UTC');
  });
});

describe('withUnits', () => {
  it('changes both units without touching showSampleData', () => {
    const preferences = new AthletePreferences('lb', 'km', false, 'UTC').withUnits('kg', 'mi');

    expect(preferences.weightUnit).toBe('kg');
    expect(preferences.distanceUnit).toBe('mi');
    expect(preferences.showSampleData).toBe(false);
  });
});

describe('withSampleData', () => {
  it('changes only the visibility flag', () => {
    const preferences = new AthletePreferences('kg', 'mi', true, 'UTC').withSampleData(false);

    expect(preferences.showSampleData).toBe(false);
    expect(preferences.weightUnit).toBe('kg');
    expect(preferences.distanceUnit).toBe('mi');
  });
});

describe('withTimezone', () => {
  it('changes only the timezone', () => {
    const preferences = new AthletePreferences('lb', 'km', true, 'UTC').withTimezone('America/Toronto');

    expect(preferences.timezone).toBe('America/Toronto');
    expect(preferences.weightUnit).toBe('lb');
    expect(preferences.distanceUnit).toBe('km');
    expect(preferences.showSampleData).toBe(true);
  });
});

describe('withRestDuration', () => {
  it('starts with no rest duration, meaning the timer is off', () => {
    expect(AthletePreferences.defaults().restDuration).toBeNull();
  });

  it('changes only the rest duration', () => {
    const preferences = new AthletePreferences('lb', 'km', true, 'UTC').withRestDuration(Duration.seconds(90));

    expect(preferences.restDuration?.inSeconds).toBe(90);
    expect(preferences.weightUnit).toBe('lb');
  });

  it('turns the timer back off with null', () => {
    const preferences = new AthletePreferences('lb', 'km', true, 'UTC', Duration.seconds(90)).withRestDuration(null);

    expect(preferences.restDuration).toBeNull();
  });
});

describe('formatting', () => {
  it('formats a weight in the preferred unit, and null as null', () => {
    const preferences = new AthletePreferences('kg', 'km', true, 'UTC');

    expect(preferences.formatWeight(Weight.lb(100))).toBe('45.4 kg');
    expect(preferences.formatWeight(null)).toBeNull();
  });

  it('formats a speed in the preferred distance unit, and null as null', () => {
    const preferences = new AthletePreferences('lb', 'mi', true, 'UTC');

    expect(preferences.formatSpeed(Speed.kmh(16.09))).toBe('10 mph');
    expect(preferences.formatSpeed(null)).toBeNull();
  });

  it('formats a duration regardless of unit preferences, and null as null', () => {
    const preferences = new AthletePreferences('lb', 'km', true, 'UTC');

    expect(preferences.formatDuration(Duration.minutes(30))).toBe('30 min');
    expect(preferences.formatDuration(null)).toBeNull();
  });

  it('exposes the bare numeric value for a chart axis', () => {
    const preferences = new AthletePreferences('kg', 'km', true, 'UTC');
    expect(preferences.weightValue(Weight.lb(100))).toBeCloseTo(45.36, 2);
  });
});
