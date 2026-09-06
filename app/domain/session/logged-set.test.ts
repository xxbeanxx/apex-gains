import { describe, expect, it } from 'vitest';

import { AthletePreferences } from '../athlete/preferences';
import { Duration } from '../values/duration';
import { Rpe } from '../values/rpe';
import { Speed } from '../values/speed';
import { Weight } from '../values/weight';
import { LoggedSet, type LoggedSetOptions } from './logged-set';

const NOW = new Date('2026-09-03T12:00:00Z');
const preferences = new AthletePreferences('lb', 'km', 'in', true, 'UTC');

function setWith(overrides: Partial<LoggedSetOptions> = {}): LoggedSet {
  return LoggedSet.of({
    id: 'set-1',
    exerciseId: 'exercise-1',
    setNumber: 1,
    reps: 8,
    weight: Weight.lb(135),
    duration: null,
    speed: null,
    resistanceLevel: null,
    notes: null,
    rpe: null,
    createdAt: NOW,
    ...overrides,
  });
}

describe('tonnage', () => {
  it('is weight times reps when both are present', () => {
    const set = setWith({ reps: 8, weight: Weight.lb(135) });
    expect(set.tonnage?.inPounds).toBe(1080);
  });

  it('is null when there is no weight', () => {
    const set = setWith({ weight: null });
    expect(set.tonnage).toBeNull();
  });

  it('is null when there is no rep count', () => {
    const set = setWith({ reps: null });
    expect(set.tonnage).toBeNull();
  });
});

describe('format', () => {
  it('formats weight and reps together', () => {
    expect(setWith({ reps: 8, weight: Weight.lb(135) }).format(preferences)).toBe('135 lb x 8');
  });

  it('formats a bodyweight set (reps, no weight) without a weight segment', () => {
    expect(setWith({ weight: null, reps: 12 }).format(preferences)).toBe('12 reps');
  });

  it('formats a weight with no rep count as just the weight', () => {
    expect(setWith({ weight: Weight.lb(135), reps: null }).format(preferences)).toBe('135 lb');
  });

  it('formats a cardio set with duration and speed', () => {
    const set = setWith({ reps: null, weight: null, duration: Duration.minutes(30), speed: Speed.kmh(8.5) });
    expect(set.format(preferences)).toBe('30 min, 8.5 km/h');
  });

  it('appends a resistance level when present', () => {
    const set = setWith({ reps: null, weight: null, duration: Duration.minutes(20), resistanceLevel: 6 });
    expect(set.format(preferences)).toBe('20 min, resistance 6');
  });

  it('is an empty string when nothing was recorded', () => {
    const set = setWith({ reps: null, weight: null });
    expect(set.format(preferences)).toBe('');
  });

  it('appends the RPE to an otherwise-formatted set', () => {
    const set = setWith({ reps: 8, weight: Weight.lb(135), rpe: Rpe.of(8) });
    expect(set.format(preferences)).toBe('135 lb x 8 @ RPE 8');
  });

  it('is just the RPE when nothing else was recorded', () => {
    const set = setWith({ reps: null, weight: null, rpe: Rpe.of(8) });
    expect(set.format(preferences)).toBe('RPE 8');
  });
});

describe('snapshot round-trip', () => {
  it('restores the same state via fromSnapshot/toSnapshot', () => {
    const original = setWith({ reps: 8, weight: Weight.lb(135), notes: 'Rod 4 slipping', rpe: Rpe.of(8.5) });
    const restored = LoggedSet.fromSnapshot(original.toSnapshot());

    expect(restored.toSnapshot()).toEqual(original.toSnapshot());
  });

  it('reads a missing weight/duration/speed/notes/rpe as null', () => {
    const restored = LoggedSet.fromSnapshot({
      id: 'set-1',
      exerciseId: 'exercise-1',
      setNumber: 1,
      reps: 5,
      weight: null,
      durationSeconds: null,
      speed: null,
      resistanceLevel: null,
      notes: null,
      rpe: null,
      createdAt: NOW,
    });

    expect(restored.weight).toBeNull();
    expect(restored.duration).toBeNull();
    expect(restored.speed).toBeNull();
    expect(restored.notes).toBeNull();
    expect(restored.rpe).toBeNull();
  });
});
