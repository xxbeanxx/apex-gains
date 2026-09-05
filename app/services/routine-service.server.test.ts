import { beforeEach, describe, expect, it } from 'vitest';

import { Athlete } from '~/domain/athlete/athlete';
import { Routine, type RoutineSnapshot } from '~/domain/routine/routine';
import { fixedClock } from '~/domain/shared/clock';
import { sequentialIds } from '~/domain/shared/ids';
import { sequentialSecrets } from '~/domain/shared/secrets';
import { DateOnly } from '~/domain/values/date-only';
import { InMemoryRoutinesRepository } from '~/repositories/in-memory/routines-repository.server';
import { InMemoryTemplatesRepository } from '~/repositories/in-memory/templates-repository.server';
import { InMemoryUnitOfWork } from '~/repositories/in-memory/unit-of-work.server';

import { RoutineService } from './routine-service.server';

const NOW = new Date('2026-09-03T12:00:00Z');

const athlete = Athlete.fromSnapshot({
  id: 'user-1',
  googleSub: 'google-1',
  email: 'athlete@example.com',
  name: 'Athlete',
  avatarUrl: null,
  weightUnit: 'lb',
  distanceUnit: 'km',
  showSampleData: true,
  isAdmin: false,
  createdAt: NOW,
  updatedAt: NOW,
});

function sampleRoutine(overrides: Partial<RoutineSnapshot> = {}): Routine {
  return Routine.fromSnapshot({
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
      { id: 'sample-slot-0', position: 0, templateId: 'template-push' },
      { id: 'sample-slot-1', position: 1, templateId: null },
    ],
    ...overrides,
  });
}

let routines: InMemoryRoutinesRepository;
let service: RoutineService;

beforeEach(() => {
  routines = new InMemoryRoutinesRepository();
  service = new RoutineService(routines, new InMemoryTemplatesRepository(), new InMemoryUnitOfWork(), {
    ids: sequentialIds('new'),
    clock: fixedClock(NOW),
    secrets: sequentialSecrets('token'),
  });
});

describe('editing a sample routine', () => {
  beforeEach(async () => {
    await routines.save(sampleRoutine());
  });

  it('forks it into a personal copy and applies the edit there', async () => {
    const outcome = await service.rename(athlete, 'sample-1', 'My PPL');

    expect(outcome.ok).toBe(true);
    const forkedId = outcome.ok ? outcome.value.forkedId : null;
    expect(forkedId).not.toBeNull();

    const fork = await routines.findVisible(athlete.id, forkedId!);
    expect(fork?.name).toBe('My PPL');
    expect(fork?.forkedFromId).toBe('sample-1');
    expect(fork?.slots.map((s) => s.templateId)).toEqual(['template-push', null]);
  });

  it('leaves the shared sample untouched', async () => {
    await service.rename(athlete, 'sample-1', 'My PPL');

    const sample = await routines.findVisible(athlete.id, 'sample-1');
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
    const fork = await routines.findVisible(athlete.id, firstId!);
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
    const fork = await routines.findVisible(athlete.id, forkedId!);
    expect(fork?.slots.map((s) => s.templateId)).toEqual([null]);
  });

  it('hides the sample once it has been forked', async () => {
    await service.rename(athlete, 'sample-1', 'My PPL');

    const listed = await service.list(athlete);
    expect(listed.map((r) => r.name)).toEqual(['My PPL']);
  });

  it("reports a routine that isn't visible as not found", async () => {
    const outcome = await service.rename(athlete, 'nope', 'Whatever');
    expect(outcome).toEqual({ ok: false, error: 'not-found' });
  });
});

describe('editing an own routine', () => {
  it('applies in place without forking', async () => {
    await routines.save(sampleRoutine({ id: 'own-1', userId: 'user-1', slots: [] }));

    const outcome = await service.rename(athlete, 'own-1', 'Renamed');

    expect(outcome).toEqual({ ok: true, value: { forkedId: null } });
    expect((await routines.findVisible(athlete.id, 'own-1'))?.name).toBe('Renamed');
  });
});

describe('activation', () => {
  beforeEach(async () => {
    await routines.save(sampleRoutine({ id: 'a', userId: 'user-1', name: 'A', slots: [] }));
    await routines.save(sampleRoutine({ id: 'b', userId: 'user-1', name: 'B', slots: [] }));
  });

  it('makes a routine active', async () => {
    await service.activate(athlete, 'a');
    expect((await routines.findActive(athlete.id))?.id).toBe('a');
  });

  /** Only one routine per athlete may be active. */
  it('stands down the previously active routine', async () => {
    await service.activate(athlete, 'a');
    await service.activate(athlete, 'b');

    expect((await routines.findActive(athlete.id))?.id).toBe('b');
    expect((await routines.findVisible(athlete.id, 'a'))?.isActive).toBe(false);
  });

  it('deactivating leaves nothing active', async () => {
    await service.activate(athlete, 'a');
    await service.deactivate(athlete, 'a');

    expect(await routines.findActive(athlete.id)).toBeNull();
  });

  it('activating a sample activates the fork, not the sample', async () => {
    await routines.save(sampleRoutine());

    const outcome = await service.activate(athlete, 'sample-1');

    const forkedId = outcome.ok ? outcome.value.forkedId : null;
    expect(forkedId).not.toBeNull();
    expect((await routines.findActive(athlete.id))?.id).toBe(forkedId);
    expect((await routines.findVisible(athlete.id, 'sample-1'))?.isActive).toBe(false);
  });
});

describe('deleting and reverting', () => {
  it('refuses to delete a shared sample', async () => {
    await routines.save(sampleRoutine());
    expect(await service.remove(athlete, 'sample-1')).toEqual({
      ok: false,
      error: 'sample',
    });
  });

  it('reverting a fork removes it and names the original', async () => {
    await routines.save(sampleRoutine());
    const renamed = await service.rename(athlete, 'sample-1', 'Mine');
    const forkedId = renamed.ok ? renamed.value.forkedId : null;

    const outcome = await service.revert(athlete, forkedId!);

    expect(outcome).toEqual({
      ok: true,
      value: { forkedFromId: 'sample-1' },
    });
    expect(await routines.findVisible(athlete.id, forkedId!)).toBeNull();
    // The sample is back in the athlete's list now nothing forks from it.
    expect((await service.list(athlete)).map((r) => r.name)).toEqual(['Sample PPL']);
  });

  it('refuses to revert a routine that was never a copy', async () => {
    await routines.save(sampleRoutine({ id: 'own-1', userId: 'user-1', slots: [] }));
    expect(await service.revert(athlete, 'own-1')).toEqual({
      ok: false,
      error: 'nothing-to-revert',
    });
  });
});

describe('sharing', () => {
  it('mints a token on the athlete s own routine and reports no fork', async () => {
    await routines.save(sampleRoutine({ id: 'own-1', userId: 'user-1', slots: [] }));

    const outcome = await service.share(athlete, 'own-1');

    expect(outcome.ok).toBe(true);
    expect(outcome.ok && outcome.value.forkedId).toBeNull();
    expect((await routines.findVisible(athlete.id, 'own-1'))?.shareToken).toBe(outcome.ok ? outcome.value.token : null);
  });

  it('hands back the same token when shared again', async () => {
    await routines.save(sampleRoutine({ id: 'own-1', userId: 'user-1', slots: [] }));

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
    await routines.save(sampleRoutine());

    const outcome = await service.share(athlete, 'sample-1');

    expect(outcome.ok).toBe(true);
    const forkedId = outcome.ok ? outcome.value.forkedId : null;
    expect(forkedId).not.toBeNull();

    expect((await routines.findVisible(athlete.id, forkedId!))?.shareToken).toBe(outcome.ok ? outcome.value.token : null);
    expect((await routines.findVisible(athlete.id, 'sample-1'))?.shareToken).toBeNull();
  });

  it('revoking drops the token, so the link resolves to nothing', async () => {
    await routines.save(sampleRoutine({ id: 'own-1', userId: 'user-1', slots: [] }));
    const shared = await service.share(athlete, 'own-1');
    const token = shared.ok ? shared.value.token : '';

    expect(await service.unshare(athlete, 'own-1')).toEqual({ ok: true, value: { forkedId: null } });

    expect(await routines.findByShareToken(token)).toBeNull();
  });

  it('reports not-found for a routine the athlete cannot see', async () => {
    await routines.save(sampleRoutine({ id: 'theirs', userId: 'someone-else', slots: [] }));

    expect(await service.share(athlete, 'theirs')).toEqual({ ok: false, error: 'not-found' });
    expect(await service.unshare(athlete, 'theirs')).toEqual({ ok: false, error: 'not-found' });
  });

  it('carries the token into the routine summary the page renders', async () => {
    await routines.save(sampleRoutine({ id: 'own-1', userId: 'user-1', slots: [] }));
    const shared = await service.share(athlete, 'own-1');

    const detail = await service.detail(athlete, 'own-1');

    expect(detail?.shareToken).toBe(shared.ok ? shared.value.token : null);
  });
});
