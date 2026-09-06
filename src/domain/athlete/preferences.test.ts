import { describe, expect, it } from 'vitest';

import { Duration } from '../values/duration';
import { Length } from '../values/length';
import { Speed } from '../values/speed';
import { Weight } from '../values/weight';
import { AthletePreferences } from './preferences';

describe('defaults', () => {
  it('starts on pounds, kilometres, inches, sample data shown, and UTC', () => {
    const preferences = AthletePreferences.defaults();

    expect(preferences.weightUnit).toBe('lb');
    expect(preferences.distanceUnit).toBe('km');
    expect(preferences.lengthUnit).toBe('in');
    expect(preferences.showSampleData).toBe(true);
    expect(preferences.timezone).toBe('UTC');
  });
});

describe('withUnits', () => {
  it('changes all three units without touching showSampleData', () => {
    const preferences = new AthletePreferences('lb', 'km', 'in', false, 'UTC').withUnits('kg', 'mi', 'cm');

    expect(preferences.weightUnit).toBe('kg');
    expect(preferences.distanceUnit).toBe('mi');
    expect(preferences.lengthUnit).toBe('cm');
    expect(preferences.showSampleData).toBe(false);
  });
});

describe('withSampleData', () => {
  it('changes only the visibility flag', () => {
    const preferences = new AthletePreferences('kg', 'mi', 'cm', true, 'UTC').withSampleData(false);

    expect(preferences.showSampleData).toBe(false);
    expect(preferences.weightUnit).toBe('kg');
    expect(preferences.distanceUnit).toBe('mi');
    expect(preferences.lengthUnit).toBe('cm');
  });
});

describe('withTimezone', () => {
  it('changes only the timezone', () => {
    const preferences = new AthletePreferences('lb', 'km', 'in', true, 'UTC').withTimezone('America/Toronto');

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
    const preferences = new AthletePreferences('lb', 'km', 'in', true, 'UTC').withRestDuration(Duration.seconds(90));

    expect(preferences.restDuration?.inSeconds).toBe(90);
    expect(preferences.weightUnit).toBe('lb');
  });

  it('turns the timer back off with null', () => {
    const preferences = new AthletePreferences('lb', 'km', 'in', true, 'UTC', Duration.seconds(90)).withRestDuration(null);

    expect(preferences.restDuration).toBeNull();
  });
});

describe('formatting', () => {
  it('formats a weight in the preferred unit, and null as null', () => {
    const preferences = new AthletePreferences('kg', 'km', 'cm', true, 'UTC');

    expect(preferences.formatWeight(Weight.lb(100))).toBe('45.4 kg');
    expect(preferences.formatWeight(null)).toBeNull();
  });

  it('formats a speed in the preferred distance unit, and null as null', () => {
    const preferences = new AthletePreferences('lb', 'mi', 'in', true, 'UTC');

    expect(preferences.formatSpeed(Speed.kmh(16.09))).toBe('10 mph');
    expect(preferences.formatSpeed(null)).toBeNull();
  });

  it('formats a length in the preferred unit, and null as null', () => {
    const preferences = new AthletePreferences('lb', 'km', 'in', true, 'UTC');

    expect(preferences.formatLength(Length.cm(2.54))).toBe('1 in');
    expect(preferences.formatLength(null)).toBeNull();
  });

  it('formats a duration regardless of unit preferences, and null as null', () => {
    const preferences = new AthletePreferences('lb', 'km', 'in', true, 'UTC');

    expect(preferences.formatDuration(Duration.minutes(30))).toBe('30 min');
    expect(preferences.formatDuration(null)).toBeNull();
  });

  it('exposes the bare numeric value for a chart axis', () => {
    const preferences = new AthletePreferences('kg', 'km', 'cm', true, 'UTC');
    expect(preferences.weightValue(Weight.lb(100))).toBeCloseTo(45.36, 2);
  });

  it('exposes the bare numeric value for an editable length field', () => {
    const preferences = new AthletePreferences('lb', 'km', 'in', true, 'UTC');
    expect(preferences.lengthValue(Length.cm(2.54))).toBeCloseTo(1, 5);
  });
});
