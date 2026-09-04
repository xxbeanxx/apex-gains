import { describe, expect, it } from 'vitest';

import { AthletePreferences } from '../athlete/preferences';
import { Duration } from '../values/duration';
import { Speed } from '../values/speed';
import { Weight } from '../values/weight';
import { LoggedSet } from './logged-set';

const NOW = new Date('2026-09-03T12:00:00Z');
const preferences = new AthletePreferences('lb', 'km', true);

function strengthSet(overrides: Partial<{ reps: number | null; weight: Weight | null }> = {}): LoggedSet {
  return new LoggedSet(
    'set-1',
    'exercise-1',
    1,
    'reps' in overrides ? overrides.reps! : 8,
    'weight' in overrides ? overrides.weight! : Weight.lb(135),
    null,
    null,
    null,
    NOW,
  );
}

describe('tonnage', () => {
  it('is weight times reps when both are present', () => {
    const set = strengthSet({ reps: 8, weight: Weight.lb(135) });
    expect(set.tonnage?.inPounds).toBe(1080);
  });

  it('is null when there is no weight', () => {
    const set = strengthSet({ weight: null });
    expect(set.tonnage).toBeNull();
  });

  it('is null when there is no rep count', () => {
    const set = strengthSet({ reps: null });
    expect(set.tonnage).toBeNull();
  });
});

describe('format', () => {
  it('formats weight and reps together', () => {
    expect(strengthSet({ reps: 8, weight: Weight.lb(135) }).format(preferences)).toBe('135 lb x 8');
  });

  it('formats a bodyweight set (reps, no weight) without a weight segment', () => {
    expect(strengthSet({ weight: null, reps: 12 }).format(preferences)).toBe('12 reps');
  });

  it('formats a weight with no rep count as just the weight', () => {
    expect(strengthSet({ weight: Weight.lb(135), reps: null }).format(preferences)).toBe('135 lb');
  });

  it('formats a cardio set with duration and speed', () => {
    const set = new LoggedSet('set-1', 'exercise-1', 1, null, null, Duration.minutes(30), Speed.kmh(8.5), null, NOW);
    expect(set.format(preferences)).toBe('30 min, 8.5 km/h');
  });

  it('appends a resistance level when present', () => {
    const set = new LoggedSet('set-1', 'exercise-1', 1, null, null, Duration.minutes(20), null, 6, NOW);
    expect(set.format(preferences)).toBe('20 min, resistance 6');
  });

  it('is an empty string when nothing was recorded', () => {
    const set = new LoggedSet('set-1', 'exercise-1', 1, null, null, null, null, null, NOW);
    expect(set.format(preferences)).toBe('');
  });
});

describe('snapshot round-trip', () => {
  it('restores the same state via fromSnapshot/toSnapshot', () => {
    const original = strengthSet({ reps: 8, weight: Weight.lb(135) });
    const restored = LoggedSet.fromSnapshot(original.toSnapshot());

    expect(restored.toSnapshot()).toEqual(original.toSnapshot());
  });

  it('reads a missing weight/duration/speed as null', () => {
    const restored = LoggedSet.fromSnapshot({
      id: 'set-1',
      exerciseId: 'exercise-1',
      setNumber: 1,
      reps: 5,
      weight: null,
      durationSeconds: null,
      speed: null,
      resistanceLevel: null,
      createdAt: NOW,
    });

    expect(restored.weight).toBeNull();
    expect(restored.duration).toBeNull();
    expect(restored.speed).toBeNull();
  });
});
