import { describe, expect, it } from 'vitest';

import { Duration } from './duration';
import { Rpe } from './rpe';
import { Speed } from './speed';
import { Weight } from './weight';

describe('Weight', () => {
  it("round-trips a value through the athlete's unit", () => {
    const entered = Weight.in('kg', 100);
    expect(entered.as('kg')).toBeCloseTo(100, 10);
  });

  it('converts between units', () => {
    expect(Weight.kg(100).as('lb')).toBeCloseTo(220.462, 3);
    expect(Weight.lb(220.462).as('kg')).toBeCloseTo(100, 3);
  });

  it('formats a whole number without a trailing decimal', () => {
    expect(Weight.lb(135).format('lb')).toBe('135 lb');
  });

  it('formats a converted value to one decimal place', () => {
    expect(Weight.lb(135).format('kg')).toBe('61.2 kg');
  });

  /**
   * The `numeric` columns hand back strings, and a null means the set simply
   * didn't record a weight - bodyweight and cardio work both do that - which
   * must read as absent rather than as zero.
   */
  it.each([
    ['null', null],
    ['undefined', undefined],
    ['an empty string', ''],
    ['unparseable text', 'heavy'],
  ])('reads %s from storage as absent', (_label, stored) => {
    expect(Weight.fromStorage(stored)).toBeNull();
  });

  it('reads a stored numeric string', () => {
    expect(Weight.fromStorage('135.50')?.inPounds).toBe(135.5);
  });

  it("writes storage at the column's two decimal places", () => {
    expect(Weight.kg(100).toStorage()).toBe('220.46');
  });

  it('scales for tonnage', () => {
    expect(Weight.lb(100).times(8).inPounds).toBe(800);
  });

  it('sums', () => {
    expect(Weight.lb(100).plus(Weight.lb(35)).inPounds).toBe(135);
  });
});

describe('Speed', () => {
  it('converts between units', () => {
    expect(Speed.kmh(10).as('mi')).toBeCloseTo(6.214, 3);
    expect(Speed.mph(6.214).as('km')).toBeCloseTo(10, 2);
  });

  it('labels speed per hour rather than by the raw distance unit', () => {
    expect(Speed.kmh(8.5).format('km')).toBe('8.5 km/h');
    expect(Speed.kmh(10).format('mi')).toBe('6.2 mph');
  });

  it('reads an absent speed from storage as absent', () => {
    expect(Speed.fromStorage(null)).toBeNull();
  });
});

describe('Duration', () => {
  it('converts minutes to stored seconds', () => {
    expect(Duration.minutes(30).toStorage()).toBe(1800);
  });

  it('formats in whole minutes', () => {
    expect(Duration.seconds(1800).format()).toBe('30 min');
  });

  it('formats a part-minute to one decimal', () => {
    expect(Duration.seconds(1830).format()).toBe('30.5 min');
  });

  it('reads an absent duration from storage as absent', () => {
    expect(Duration.fromStorage(null)).toBeNull();
  });

  it('treats a stored zero as a real value, not as absent', () => {
    expect(Duration.fromStorage(0)?.inSeconds).toBe(0);
  });
});

describe('Rpe', () => {
  it('accepts whole and half-point ratings on the scale', () => {
    expect(Rpe.of(8).value).toBe(8);
    expect(Rpe.of(8.5).value).toBe(8.5);
  });

  it.each([
    ['below the scale', 0.5],
    ['above the scale', 10.5],
    ['not a half step', 8.3],
  ])('refuses a rating %s', (_label, value) => {
    expect(() => Rpe.of(value)).toThrow('Invalid RPE');
  });

  it('formats without a trailing decimal on a whole number', () => {
    expect(Rpe.of(8).format()).toBe('RPE 8');
  });

  it('formats a half-point rating', () => {
    expect(Rpe.of(8.5).format()).toBe('RPE 8.5');
  });

  it('reads an absent rating from storage as absent', () => {
    expect(Rpe.fromStorage(null)).toBeNull();
  });

  it("writes storage at the column's one decimal place", () => {
    expect(Rpe.of(8).toStorage()).toBe('8.0');
  });
});
