import { describe, expect, it } from 'vitest';

import { LoggedSet } from '../session/logged-set';
import { SetTarget } from '../workout/set-target';
import { DateOnly } from '../values/date-only';
import { Duration } from '../values/duration';
import { Speed } from '../values/speed';
import { Weight } from '../values/weight';
import { type RecentSession, suggestNextTarget } from './progression';

const NOW = new Date('2026-09-03T12:00:00Z');
const FIVE_POUNDS = Weight.lb(5);

let counter = 0;
function set(overrides: { reps?: number; weightLb?: number; minutes?: number; kmh?: number } = {}): LoggedSet {
  counter += 1;
  return new LoggedSet(
    `set-${counter}`,
    'exercise-1',
    1,
    overrides.reps ?? null,
    overrides.weightLb !== undefined ? Weight.lb(overrides.weightLb) : null,
    overrides.minutes !== undefined ? Duration.minutes(overrides.minutes) : null,
    overrides.kmh !== undefined ? Speed.kmh(overrides.kmh) : null,
    null,
    NOW,
  );
}

function session(date: string, sets: LoggedSet[]): RecentSession {
  return { date: DateOnly.parse(date), sets };
}

const strengthTarget = SetTarget.of({ sets: 3, reps: 10, weight: Weight.lb(135) });

describe('suggestNextTarget - strength', () => {
  it('returns null under two sessions of history', () => {
    const recent = [session('2026-09-01', [set({ reps: 10, weightLb: 135 })])];
    expect(
      suggestNextTarget(strengthTarget, recent, 'strength', { showSpeed: true, showResistance: true }, FIVE_POUNDS),
    ).toBeNull();
  });

  it('returns null with no history at all', () => {
    expect(
      suggestNextTarget(strengthTarget, [], 'strength', { showSpeed: true, showResistance: true }, FIVE_POUNDS),
    ).toBeNull();
  });

  it('returns null when the target has no weight to progress', () => {
    const bodyweightTarget = SetTarget.of({ sets: 3, reps: 10 });
    const recent = [
      session('2026-08-29', [set({ reps: 10 }), set({ reps: 10 }), set({ reps: 10 })]),
      session('2026-08-27', [set({ reps: 10 }), set({ reps: 10 }), set({ reps: 10 })]),
    ];
    expect(
      suggestNextTarget(bodyweightTarget, recent, 'strength', { showSpeed: true, showResistance: true }, FIVE_POUNDS),
    ).toBeNull();
  });

  it('suggests raising the weight after hitting sets x reps twice in a row', () => {
    const recent = [
      session('2026-08-29', [
        set({ reps: 10, weightLb: 135 }),
        set({ reps: 10, weightLb: 135 }),
        set({ reps: 11, weightLb: 135 }),
      ]),
      session('2026-08-27', [
        set({ reps: 10, weightLb: 135 }),
        set({ reps: 12, weightLb: 135 }),
        set({ reps: 10, weightLb: 135 }),
      ]),
    ];

    const suggestion = suggestNextTarget(
      strengthTarget,
      recent,
      'strength',
      { showSpeed: true, showResistance: true },
      FIVE_POUNDS,
    );

    expect(suggestion).toEqual({
      kind: 'increase-weight',
      target: SetTarget.of({ sets: 3, reps: 10, weight: Weight.lb(140) }),
      because: 'you hit 3 x 10 twice',
    });
  });

  it('does not suggest raising the weight from a single good session', () => {
    const recent = [
      session('2026-08-29', [
        set({ reps: 10, weightLb: 135 }),
        set({ reps: 10, weightLb: 135 }),
        set({ reps: 10, weightLb: 135 }),
      ]),
      session('2026-08-27', [
        set({ reps: 8, weightLb: 135 }),
        set({ reps: 8, weightLb: 135 }),
        set({ reps: 8, weightLb: 135 }),
      ]),
    ];

    const suggestion = suggestNextTarget(
      strengthTarget,
      recent,
      'strength',
      { showSpeed: true, showResistance: true },
      FIVE_POUNDS,
    );

    expect(suggestion?.kind).toBe('increase-reps');
  });

  it('suggests adding a rep when sets were met but reps fell short in the latest session', () => {
    const recent = [
      session('2026-08-29', [
        set({ reps: 8, weightLb: 135 }),
        set({ reps: 8, weightLb: 135 }),
        set({ reps: 8, weightLb: 135 }),
      ]),
      session('2026-08-27', [
        set({ reps: 8, weightLb: 135 }),
        set({ reps: 8, weightLb: 135 }),
        set({ reps: 8, weightLb: 135 }),
      ]),
    ];

    const suggestion = suggestNextTarget(
      strengthTarget,
      recent,
      'strength',
      { showSpeed: true, showResistance: true },
      FIVE_POUNDS,
    );

    expect(suggestion).toEqual({
      kind: 'increase-reps',
      target: SetTarget.of({ sets: 3, reps: 11, weight: Weight.lb(135) }),
      because: 'you hit 3 sets at this weight',
    });
  });

  it('holds when neither the set count nor the reps were met', () => {
    const recent = [
      session('2026-08-29', [set({ reps: 6, weightLb: 135 }), set({ reps: 6, weightLb: 135 })]),
      session('2026-08-27', [set({ reps: 6, weightLb: 135 })]),
    ];

    const suggestion = suggestNextTarget(
      strengthTarget,
      recent,
      'strength',
      { showSpeed: true, showResistance: true },
      FIVE_POUNDS,
    );

    expect(suggestion).toEqual({
      kind: 'hold',
      target: strengthTarget,
      because: 'working towards 3 x 10',
    });
  });

  it('holds when a set was logged lighter than the target weight', () => {
    const recent = [
      session('2026-08-29', [
        set({ reps: 10, weightLb: 130 }),
        set({ reps: 10, weightLb: 130 }),
        set({ reps: 10, weightLb: 130 }),
      ]),
      session('2026-08-27', [
        set({ reps: 10, weightLb: 130 }),
        set({ reps: 10, weightLb: 130 }),
        set({ reps: 10, weightLb: 130 }),
      ]),
    ];

    const suggestion = suggestNextTarget(
      strengthTarget,
      recent,
      'strength',
      { showSpeed: true, showResistance: true },
      FIVE_POUNDS,
    );

    expect(suggestion?.kind).toBe('hold');
  });

  it('only ever consults the two most recent sessions', () => {
    const recent = [
      session('2026-08-29', [set({ reps: 6, weightLb: 135 })]),
      session('2026-08-27', [set({ reps: 6, weightLb: 135 })]),
      session('2026-08-25', [
        set({ reps: 10, weightLb: 135 }),
        set({ reps: 10, weightLb: 135 }),
        set({ reps: 10, weightLb: 135 }),
      ]),
      session('2026-08-23', [
        set({ reps: 10, weightLb: 135 }),
        set({ reps: 10, weightLb: 135 }),
        set({ reps: 10, weightLb: 135 }),
      ]),
    ];

    const suggestion = suggestNextTarget(
      strengthTarget,
      recent,
      'strength',
      { showSpeed: true, showResistance: true },
      FIVE_POUNDS,
    );

    // The two strong sessions further back don't rescue a weak recent pair.
    expect(suggestion?.kind).toBe('hold');
  });

  it('scales the weight increment the caller supplies, in kilograms too', () => {
    const recent = [
      session('2026-08-29', [
        set({ reps: 10, weightLb: 135 }),
        set({ reps: 10, weightLb: 135 }),
        set({ reps: 10, weightLb: 135 }),
      ]),
      session('2026-08-27', [
        set({ reps: 10, weightLb: 135 }),
        set({ reps: 10, weightLb: 135 }),
        set({ reps: 10, weightLb: 135 }),
      ]),
    ];

    const suggestion = suggestNextTarget(
      strengthTarget,
      recent,
      'strength',
      { showSpeed: true, showResistance: true },
      Weight.kg(2.5),
    );

    expect(suggestion?.target.weight?.inPounds).toBeCloseTo(Weight.lb(135).plus(Weight.kg(2.5)).inPounds, 5);
  });
});

const cardioTarget = SetTarget.of({ duration: Duration.minutes(20), speed: Speed.kmh(8) });

describe('suggestNextTarget - cardio', () => {
  it('returns null when the target has no duration to progress', () => {
    const recent = [
      session('2026-08-29', [set({ minutes: 20, kmh: 8 })]),
      session('2026-08-27', [set({ minutes: 20, kmh: 8 })]),
    ];
    expect(
      suggestNextTarget(SetTarget.none(), recent, 'cardio', { showSpeed: true, showResistance: false }, FIVE_POUNDS),
    ).toBeNull();
  });

  it('suggests raising the speed after hitting duration and speed twice, when the equipment reports speed', () => {
    const recent = [
      session('2026-08-29', [set({ minutes: 20, kmh: 8 })]),
      session('2026-08-27', [set({ minutes: 22, kmh: 8.5 })]),
    ];

    const suggestion = suggestNextTarget(
      cardioTarget,
      recent,
      'cardio',
      { showSpeed: true, showResistance: false },
      FIVE_POUNDS,
    );

    expect(suggestion).toEqual({
      kind: 'increase-speed',
      target: SetTarget.of({ duration: Duration.minutes(20), speed: Speed.kmh(8.5) }),
      because: 'you hit it twice',
    });
  });

  it('suggests raising the duration instead, on equipment that reports only resistance', () => {
    const durationOnlyTarget = SetTarget.of({ duration: Duration.minutes(20) });
    const recent = [session('2026-08-29', [set({ minutes: 21 })]), session('2026-08-27', [set({ minutes: 20 })])];

    const suggestion = suggestNextTarget(
      durationOnlyTarget,
      recent,
      'cardio',
      { showSpeed: false, showResistance: true },
      FIVE_POUNDS,
    );

    expect(suggestion).toEqual({
      kind: 'increase-duration',
      target: SetTarget.of({ duration: Duration.minutes(21) }),
      because: 'you hit it twice',
    });
  });

  it('holds when duration was met but speed fell short', () => {
    const recent = [
      session('2026-08-29', [set({ minutes: 20, kmh: 7 })]),
      session('2026-08-27', [set({ minutes: 20, kmh: 7 })]),
    ];

    const suggestion = suggestNextTarget(
      cardioTarget,
      recent,
      'cardio',
      { showSpeed: true, showResistance: false },
      FIVE_POUNDS,
    );

    expect(suggestion?.kind).toBe('hold');
  });

  it('ignores speed on equipment that does not report it, even if a stray value was logged', () => {
    const target = SetTarget.of({ duration: Duration.minutes(20) });
    const recent = [
      session('2026-08-29', [set({ minutes: 20, kmh: 1 })]),
      session('2026-08-27', [set({ minutes: 20, kmh: 1 })]),
    ];

    const suggestion = suggestNextTarget(target, recent, 'cardio', { showSpeed: false, showResistance: true }, FIVE_POUNDS);

    expect(suggestion?.kind).toBe('increase-duration');
  });
});
