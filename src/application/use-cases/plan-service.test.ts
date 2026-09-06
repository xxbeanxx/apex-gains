import { beforeEach, describe, expect, it } from 'vitest';

import { Athlete } from '~domain/athlete/athlete';
import { Plan, type PlanSnapshot } from '~domain/plan/plan';
import { fixedClock } from '~domain/shared/clock';
import { sequentialIds } from '~domain/shared/ids';
import { sequentialSecrets } from '~domain/shared/secrets';
import { DateOnly } from '~domain/values/date-only';
import { InMemoryPlansRepository } from '~infrastructure/persistence/in-memory/plans-repository';
import { InMemoryWorkoutsRepository } from '~infrastructure/persistence/in-memory/workouts-repository';
import { InMemoryUnitOfWork } from '~infrastructure/persistence/in-memory/unit-of-work';

import { PlanService } from './plan-service';

const NOW = new Date('2026-09-03T12:00:00Z');

const athlete = Athlete.fromSnapshot({
  id: 'user-1',
  googleSub: 'google-1',
  email: 'athlete@example.com',
  name: 'Athlete',
  avatarUrl: null,
  weightUnit: 'lb',
  distanceUnit: 'km',
  lengthUnit: 'in',
  showSampleData: true,
  defaultRestSeconds: null,
  timezone: 'UTC',
  isAdmin: false,
  createdAt: NOW,
  updatedAt: NOW,
});

function samplePlan(overrides: Partial<PlanSnapshot> = {}): Plan {
  return Plan.fromSnapshot({
    id: 'sample-1',
    userId: null,
    forkedFromId: null,
    name: 'Sample PPL',
    isActive: false,
    anchorDate: '2026-09-01',
    shareToken: null,
    createdAt: NOW,
    updatedAt: NOW,
    slots: [
      { id: 'sample-slot-0', position: 0, workoutId: 'workout-push' },
      { id: 'sample-slot-1', position: 1, workoutId: null },
    ],
    ...overrides,
  });
}

let plans: InMemoryPlansRepository;
let service: PlanService;

beforeEach(() => {
  plans = new InMemoryPlansRepository();
  service = new PlanService(plans, new InMemoryWorkoutsRepository(), new InMemoryUnitOfWork(), {
    ids: sequentialIds('new'),
    clock: fixedClock(NOW),
    secrets: sequentialSecrets('token'),
  });
});

describe('editing a sample plan', () => {
  beforeEach(async () => {
    await plans.save(samplePlan());
  });

  it('forks it into a personal copy and applies the edit there', async () => {
    const outcome = await service.rename(athlete, 'sample-1', 'My PPL');

    expect(outcome.ok).toBe(true);
    const forkedId = outcome.ok ? outcome.value.forkedId : null;
    expect(forkedId).not.toBeNull();

    const fork = await plans.findVisible(athlete.id, forkedId!);
    expect(fork?.name).toBe('My PPL');
    expect(fork?.forkedFromId).toBe('sample-1');
    expect(fork?.slots.map((s) => s.workoutId)).toEqual(['workout-push', null]);
  });

  it('leaves the shared sample untouched', async () => {
    await service.rename(athlete, 'sample-1', 'My PPL');

    const sample = await plans.findVisible(athlete.id, 'sample-1');
    expect(sample?.name).toBe('Sample PPL');
  });

  /**
   * Forking is idempotent. Without this, every edit at the sample's URL
   * would mint another copy and the athlete's list would fill with
   * duplicates.
   */
  it('reuses the existing fork on a second edit', async () => {
    const first = await service.rename(athlete, 'sample-1', 'First');
    const second = await service.reanchor(athlete, 'sample-1', DateOnly.parse('2026-09-05'));

    expect(first.ok && second.ok).toBe(true);
    const firstId = first.ok ? first.value.forkedId : null;
    const secondId = second.ok ? second.value.forkedId : null;
    expect(secondId).toBe(firstId);

    // Both edits landed on the one copy.
    const fork = await plans.findVisible(athlete.id, firstId!);
    expect(fork?.name).toBe('First');
    expect(fork?.anchorDate.value).toBe('2026-09-05');
  });

  /**
   * A slotId from a form names a slot of the *sample*; the mutation runs
   * against the fork, whose slots are different rows.
   */
  it('removes the slot the form named, on the fork', async () => {
    const outcome = await service.removeSlot(athlete, 'sample-1', 'sample-slot-0');

    expect(outcome.ok).toBe(true);
    const forkedId = outcome.ok ? outcome.value.forkedId : null;
    const fork = await plans.findVisible(athlete.id, forkedId!);
    expect(fork?.slots.map((s) => s.workoutId)).toEqual([null]);
  });

  it('hides the sample once it has been forked', async () => {
    await service.rename(athlete, 'sample-1', 'My PPL');

    const listed = await service.list(athlete);
    expect(listed.map((r) => r.name)).toEqual(['My PPL']);
  });

  it("reports a plan that isn't visible as not found", async () => {
    const outcome = await service.rename(athlete, 'nope', 'Whatever');
    expect(outcome).toEqual({ ok: false, error: 'not-found' });
  });
});

describe('editing an own plan', () => {
  it('applies in place without forking', async () => {
    await plans.save(samplePlan({ id: 'own-1', userId: 'user-1', slots: [] }));

    const outcome = await service.rename(athlete, 'own-1', 'Renamed');

    expect(outcome).toEqual({ ok: true, value: { forkedId: null } });
    expect((await plans.findVisible(athlete.id, 'own-1'))?.name).toBe('Renamed');
  });
});

describe('activation', () => {
  beforeEach(async () => {
    await plans.save(samplePlan({ id: 'a', userId: 'user-1', name: 'A', slots: [] }));
    await plans.save(samplePlan({ id: 'b', userId: 'user-1', name: 'B', slots: [] }));
  });

  it('makes a plan active', async () => {
    await service.activate(athlete, 'a');
    expect((await plans.findActive(athlete.id))?.id).toBe('a');
  });

  /** Only one plan per athlete may be active. */
  it('stands down the previously active plan', async () => {
    await service.activate(athlete, 'a');
    await service.activate(athlete, 'b');

    expect((await plans.findActive(athlete.id))?.id).toBe('b');
    expect((await plans.findVisible(athlete.id, 'a'))?.isActive).toBe(false);
  });

  it('deactivating leaves nothing active', async () => {
    await service.activate(athlete, 'a');
    await service.deactivate(athlete, 'a');

    expect(await plans.findActive(athlete.id)).toBeNull();
  });

  it('activating a sample activates the fork, not the sample', async () => {
    await plans.save(samplePlan());

    const outcome = await service.activate(athlete, 'sample-1');

    const forkedId = outcome.ok ? outcome.value.forkedId : null;
    expect(forkedId).not.toBeNull();
    expect((await plans.findActive(athlete.id))?.id).toBe(forkedId);
    expect((await plans.findVisible(athlete.id, 'sample-1'))?.isActive).toBe(false);
  });
});

describe('deleting and reverting', () => {
  it('refuses to delete a shared sample', async () => {
    await plans.save(samplePlan());
    expect(await service.remove(athlete, 'sample-1')).toEqual({
      ok: false,
      error: 'sample',
    });
  });

  it('reverting a fork removes it and names the original', async () => {
    await plans.save(samplePlan());
    const renamed = await service.rename(athlete, 'sample-1', 'Mine');
    const forkedId = renamed.ok ? renamed.value.forkedId : null;

    const outcome = await service.revert(athlete, forkedId!);

    expect(outcome).toEqual({
      ok: true,
      value: { forkedFromId: 'sample-1' },
    });
    expect(await plans.findVisible(athlete.id, forkedId!)).toBeNull();
    // The sample is back in the athlete's list now nothing forks from it.
    expect((await service.list(athlete)).map((r) => r.name)).toEqual(['Sample PPL']);
  });

  it('refuses to revert a plan that was never a copy', async () => {
    await plans.save(samplePlan({ id: 'own-1', userId: 'user-1', slots: [] }));
    expect(await service.revert(athlete, 'own-1')).toEqual({
      ok: false,
      error: 'nothing-to-revert',
    });
  });
});

describe('sharing', () => {
  it('mints a token on the athlete s own plan and reports no fork', async () => {
    await plans.save(samplePlan({ id: 'own-1', userId: 'user-1', slots: [] }));

    const outcome = await service.share(athlete, 'own-1');

    expect(outcome.ok).toBe(true);
    expect(outcome.ok && outcome.value.forkedId).toBeNull();
    expect((await plans.findVisible(athlete.id, 'own-1'))?.shareToken).toBe(outcome.ok ? outcome.value.token : null);
  });

  it('hands back the same token when shared again', async () => {
    await plans.save(samplePlan({ id: 'own-1', userId: 'user-1', slots: [] }));

    const first = await service.share(athlete, 'own-1');
    const second = await service.share(athlete, 'own-1');

    expect(second.ok && second.value.token).toBe(first.ok ? first.value.token : null);
  });

  /**
   * A token names one row, and a sample belongs to everyone - so sharing one
   * forks it first, exactly as renaming it would. The token then belongs to
   * the fork, which is why the caller has to follow `forkedId`.
   */
  it('forks a sample first, and mints the token on the fork', async () => {
    await plans.save(samplePlan());

    const outcome = await service.share(athlete, 'sample-1');

    expect(outcome.ok).toBe(true);
    const forkedId = outcome.ok ? outcome.value.forkedId : null;
    expect(forkedId).not.toBeNull();

    expect((await plans.findVisible(athlete.id, forkedId!))?.shareToken).toBe(outcome.ok ? outcome.value.token : null);
    expect((await plans.findVisible(athlete.id, 'sample-1'))?.shareToken).toBeNull();
  });

  it('revoking drops the token, so the link resolves to nothing', async () => {
    await plans.save(samplePlan({ id: 'own-1', userId: 'user-1', slots: [] }));
    const shared = await service.share(athlete, 'own-1');
    const token = shared.ok ? shared.value.token : '';

    expect(await service.unshare(athlete, 'own-1')).toEqual({ ok: true, value: { forkedId: null } });

    expect(await plans.findByShareToken(token)).toBeNull();
  });

  it('reports not-found for a plan the athlete cannot see', async () => {
    await plans.save(samplePlan({ id: 'theirs', userId: 'someone-else', slots: [] }));

    expect(await service.share(athlete, 'theirs')).toEqual({ ok: false, error: 'not-found' });
    expect(await service.unshare(athlete, 'theirs')).toEqual({ ok: false, error: 'not-found' });
  });

  it('carries the token into the plan summary the page renders', async () => {
    await plans.save(samplePlan({ id: 'own-1', userId: 'user-1', slots: [] }));
    const shared = await service.share(athlete, 'own-1');

    const detail = await service.detail(athlete, 'own-1');

    expect(detail?.shareToken).toBe(shared.ok ? shared.value.token : null);
  });
});

describe('duplicate', () => {
  it('copies a sample into a plain, unforked personal plan named "<name> (copy)", keeping its slots and anchor', async () => {
    await plans.save(samplePlan());

    const outcome = await service.duplicate(athlete, 'sample-1');

    expect(outcome.ok).toBe(true);
    const copyId = outcome.ok ? outcome.value.id : null;
    const copy = await plans.findVisible(athlete.id, copyId!);
    expect(copy?.name).toBe('Sample PPL (copy)');
    expect(copy?.ownership.isSample).toBe(false);
    expect(copy?.forkedFromId).toBeNull();
    expect(copy?.isActive).toBe(false);
    expect(copy?.anchorDate.value).toBe('2026-09-01');
    expect(copy?.slots.map((slot) => slot.workoutId)).toEqual(['workout-push', null]);

    // The sample is untouched and still shows in the athlete's list.
    const sample = await plans.findVisible(athlete.id, 'sample-1');
    expect(sample).not.toBeNull();
  });

  it('numbers a second duplicate past the first', async () => {
    await plans.save(samplePlan({ id: 'own-1', userId: 'user-1', name: 'PPL', slots: [] }));
    await service.duplicate(athlete, 'own-1');

    const second = await service.duplicate(athlete, 'own-1');

    const copyId = second.ok ? second.value.id : null;
    const copy = await plans.findVisible(athlete.id, copyId!);
    expect(copy?.name).toBe('PPL (copy 2)');
  });

  it("reports a plan that isn't visible as not found", async () => {
    expect(await service.duplicate(athlete, 'nope')).toEqual({ ok: false, error: 'not-found' });
  });
});

describe('next occurrence dates', () => {
  it('gives each slot the next date its turn comes round, in the athlete s timezone', async () => {
    // NOW is 2026-09-03T12:00:00Z; the plan's own anchor is 2026-09-01, so a
    // 6-slot cycle puts slot 2 on today and wraps slot 0 and slot 1 forward.
    await plans.save(
      samplePlan({
        id: 'own-1',
        userId: 'user-1',
        anchorDate: '2026-09-01',
        slots: Array.from({ length: 6 }, (_, position) => ({ id: `slot-${position}`, position, workoutId: null })),
      }),
    );

    const detail = await service.detail(athlete, 'own-1');

    expect(detail?.slots.map((slot) => slot.nextDate)).toEqual([
      '2026-09-07', // slot 0 already had its turn today's cycle - next one is a full cycle on
      '2026-09-08',
      '2026-09-03', // today
      '2026-09-04',
      '2026-09-05',
      '2026-09-06',
    ]);
  });

  it('still answers correctly for a plan anchored in the future', async () => {
    await plans.save(
      samplePlan({
        id: 'own-1',
        userId: 'user-1',
        anchorDate: '2026-09-10',
        slots: [
          { id: 'slot-0', position: 0, workoutId: 'workout-push' },
          { id: 'slot-1', position: 1, workoutId: null },
        ],
      }),
    );

    const detail = await service.detail(athlete, 'own-1');

    // NOW (2026-09-03) is 7 days before the anchor; 7 mod 2 = 1, so today
    // already lands on slot 1, and slot 0 is due the day after.
    expect(detail?.slots.map((slot) => slot.nextDate)).toEqual(['2026-09-04', '2026-09-03']);
  });
});
