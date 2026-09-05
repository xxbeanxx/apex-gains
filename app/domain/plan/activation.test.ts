import { describe, expect, it } from 'vitest';

import { activatePlan } from './activation';
import { Plan, type PlanSnapshot } from './plan';

const NOW = new Date('2026-09-03T12:00:00Z');

function plan(id: string, isActive = false): Plan {
  const snapshot: PlanSnapshot = {
    id,
    userId: 'user-1',
    forkedFromId: null,
    name: id,
    isActive,
    anchorDate: '2026-09-01',
    shareToken: null,
    createdAt: NOW,
    updatedAt: NOW,
    slots: [],
  };
  return Plan.fromSnapshot(snapshot);
}

describe('activatePlan', () => {
  it('activates a plan when nothing is active yet', () => {
    const target = plan('a');

    const changed = activatePlan(target, null, NOW);

    expect(target.isActive).toBe(true);
    expect(changed).toEqual([target]);
  });

  /**
   * The whole reason this is a domain service rather than a method: only one
   * plan per athlete may be active, and no single plan can enforce
   * that on its own.
   */
  it('stands down the previously active plan', () => {
    const target = plan('a');
    const previous = plan('b', true);

    const changed = activatePlan(target, previous, NOW);

    expect(previous.isActive).toBe(false);
    expect(target.isActive).toBe(true);
    // Both changed, so both must be saved - in one transaction, since the
    // schema refuses two active rows for one athlete.
    expect(changed).toEqual([previous, target]);
  });

  it('is idempotent when the target is already the active one', () => {
    const target = plan('a', true);

    const changed = activatePlan(target, target, NOW);

    expect(target.isActive).toBe(true);
    expect(changed).toEqual([target]);
  });

  it('stamps the plans it changed', () => {
    const target = plan('a');
    const later = new Date('2026-09-04T08:00:00Z');

    activatePlan(target, null, later);

    expect(target.updatedAt).toEqual(later);
  });
});
