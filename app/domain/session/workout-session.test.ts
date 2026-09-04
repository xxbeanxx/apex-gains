import { describe, expect, it } from 'vitest';

import { fixedClock } from '../shared/clock';
import { sequentialIds } from '../shared/ids';
import { DateOnly } from '../values/date-only';
import { Duration } from '../values/duration';
import { Weight } from '../values/weight';
import { WorkoutSession } from './workout-session';

const NOW = new Date('2026-09-03T12:00:00Z');
const DATE = DateOnly.parse('2026-09-03');

const deps = () => ({ ids: sequentialIds('set'), clock: fixedClock(NOW) });

function openSession(isRestDay = false) {
  return WorkoutSession.open('user-1', DATE, { routineId: 'routine-1', templateId: 'template-1', isRestDay }, deps());
}

describe('set numbering', () => {
  it('numbers sets from one, per exercise', () => {
    const session = openSession();
    const shared = deps();

    session.logSet('bench', { reps: 10 }, shared);
    session.logSet('bench', { reps: 8 }, shared);
    session.logSet('row', { reps: 12 }, shared);

    expect(session.setsFor('bench').map((s) => s.setNumber)).toEqual([1, 2]);
    expect(session.setsFor('row').map((s) => s.setNumber)).toEqual([1]);
  });

  it('numbers a pyramid in the order it was performed', () => {
    const session = openSession();
    const shared = deps();

    for (const reps of [12, 10, 8, 6]) {
      session.logSet('bench', { reps }, shared);
    }

    expect(session.setsFor('bench').map((s) => `${s.setNumber}x${s.reps}`)).toEqual(['1x12', '2x10', '3x8', '4x6']);
  });

  /**
   * Renumbering after a removal would rewrite what the athlete actually did -
   * their third set was still their third set, whatever happened to the
   * second.
   */
  it('leaves later set numbers alone when one is removed', () => {
    const session = openSession();
    const shared = deps();
    session.logSet('bench', { reps: 12 }, shared);
    const second = session.logSet('bench', { reps: 10 }, shared);
    session.logSet('bench', { reps: 8 }, shared);

    expect(session.removeSet(second.id, NOW)).toBe(true);

    expect(session.setsFor('bench').map((s) => s.setNumber)).toEqual([1, 3]);
  });

  it("reports removing a set that isn't there", () => {
    const session = openSession();
    expect(session.removeSet('nope', NOW)).toBe(false);
  });
});

describe('tonnage', () => {
  it('sums weight times reps across the day', () => {
    const session = openSession();
    const shared = deps();
    session.logSet('bench', { reps: 10, weight: Weight.lb(100) }, shared);
    session.logSet('bench', { reps: 8, weight: Weight.lb(110) }, shared);

    expect(session.tonnage.inPounds).toBe(1880);
  });

  it('counts nothing for sets with no weight recorded', () => {
    const session = openSession();
    const shared = deps();
    session.logSet('pullup', { reps: 10 }, shared);
    session.logSet('treadmill', { duration: Duration.minutes(30) }, shared);

    expect(session.tonnage.inPounds).toBe(0);
  });

  it('counts nothing for a weight logged without reps', () => {
    const session = openSession();
    session.logSet('bench', { weight: Weight.lb(100) }, deps());
    expect(session.tonnage.inPounds).toBe(0);
  });
});

describe('how a day reads', () => {
  it('counts distinct exercises, not sets', () => {
    const session = openSession();
    const shared = deps();
    session.logSet('bench', { reps: 10 }, shared);
    session.logSet('bench', { reps: 8 }, shared);
    session.logSet('row', { reps: 10 }, shared);

    expect(session.setCount).toBe(3);
    expect(session.exerciseCount).toBe(2);
  });

  it('reads as a rest day when it was planned as one and nothing was logged', () => {
    expect(openSession(true).status).toBe('rest');
  });

  it('reads as nothing when it was a training day but nothing was logged', () => {
    expect(openSession(false).status).toBe('none');
  });

  /** Training through a scheduled rest day still counts as having trained. */
  it('reads as a workout once sets exist, even on a planned rest day', () => {
    const session = openSession(true);
    session.logSet('bench', { reps: 10 }, deps());
    expect(session.status).toBe('workout');
  });
});

describe('snapshots', () => {
  it('round-trips a logged set through storage', () => {
    const session = openSession();
    session.logSet('bench', { reps: 8, weight: Weight.kg(60) }, deps());

    const restored = WorkoutSession.fromSnapshot(session.toSnapshot());
    const set = restored.setsFor('bench')[0];

    expect(set.reps).toBe(8);
    expect(set.weight?.as('kg')).toBeCloseTo(60, 1);
  });

  it('orders restored sets by when they were performed', () => {
    const session = openSession();
    const shared = deps();
    session.logSet('a', { reps: 1 }, shared);
    session.logSet('b', { reps: 2 }, shared);

    const restored = WorkoutSession.fromSnapshot(session.toSnapshot());
    expect(restored.sets.map((s) => s.exerciseId)).toEqual(['a', 'b']);
  });
});
