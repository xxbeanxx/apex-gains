import { beforeEach, describe, expect, it } from 'vitest';

import { Routine } from '~/domain/routine/routine';
import { fixedClock } from '~/domain/shared/clock';
import { sequentialIds } from '~/domain/shared/ids';
import { err, ok } from '~/domain/shared/result';
import { InMemoryRoutinesRepository } from '~/repositories/in-memory/routines-repository.server';
import { InMemoryUnitOfWork } from '~/repositories/in-memory/unit-of-work.server';

import { ForkableLibrary } from './fork.server';

/**
 * `Routine` stands in for every forkable aggregate here: the editor is
 * generic, so what is under test is the sequence, not the aggregate. The
 * adapters are real - a fork resolved against a fake store would prove
 * nothing about whether a second fork gets minted.
 */
const NOW = new Date('2026-09-03T12:00:00Z');
const deps = { ids: sequentialIds('generated'), clock: fixedClock(NOW) };

function routine(overrides: { id: string; userId: string | null; forkedFromId?: string | null; slots?: string[] }): Routine {
  return Routine.fromSnapshot({
    id: overrides.id,
    userId: overrides.userId,
    forkedFromId: overrides.forkedFromId ?? null,
    name: 'PPL',
    isActive: false,
    anchorDate: '2026-09-01',
    createdAt: NOW,
    updatedAt: NOW,
    slots: (overrides.slots ?? []).map((id, position) => ({ id, position, templateId: null })),
  });
}

describe('ForkableLibrary', () => {
  let routines: InMemoryRoutinesRepository;
  let editor: ForkableLibrary<Routine>;

  beforeEach(() => {
    routines = new InMemoryRoutinesRepository();
    editor = new ForkableLibrary(routines, new InMemoryUnitOfWork(), deps, (loaded) => loaded.slots);
  });

  describe('mutate', () => {
    it("applies to the athlete's own row in place, reporting no fork", async () => {
      await routines.save(routine({ id: 'own-1', userId: 'user-1' }));

      const outcome = await editor.mutate('user-1', 'own-1', (loaded) => loaded.rename('Upper/Lower', NOW));

      expect(outcome).toEqual({ ok: true, value: { forkedId: null } });
      expect((await routines.findVisible('user-1', 'own-1'))?.name).toBe('Upper/Lower');
    });

    it('forks a sample on first edit, leaving the shared original untouched', async () => {
      await routines.save(routine({ id: 'sample-1', userId: null }));

      const outcome = await editor.mutate('user-1', 'sample-1', (loaded) => loaded.rename('Mine', NOW));

      expect(outcome.ok).toBe(true);
      const forkedId = outcome.ok ? outcome.value.forkedId : null;
      expect(forkedId).not.toBeNull();
      expect((await routines.findVisible('user-1', forkedId!))?.name).toBe('Mine');
      expect((await routines.findVisible('user-1', 'sample-1'))?.name).toBe('PPL');
    });

    it('reuses an existing fork rather than minting a second one', async () => {
      await routines.save(routine({ id: 'sample-1', userId: null }));

      const first = await editor.mutate('user-1', 'sample-1', (loaded) => loaded.rename('First', NOW));
      const second = await editor.mutate('user-1', 'sample-1', (loaded) => loaded.rename('Second', NOW));

      expect(first.ok && second.ok && second.value.forkedId).toBe(first.ok ? first.value.forkedId : null);
      expect(await routines.listFor('user-1', true)).toHaveLength(1);
    });

    /**
     * A fork's children get new ids, so an id that arrived on a form names a
     * child of the *sample*. It has to be translated onto the copy by
     * position, or the edit lands on nothing.
     */
    it('translates a child id from the sample onto the copy', async () => {
      await routines.save(routine({ id: 'sample-1', userId: null, slots: ['slot-a', 'slot-b'] }));

      const outcome = await editor.mutate('user-1', 'sample-1', (loaded, translate) => {
        loaded.removeSlot(translate('slot-a'), NOW);
      });

      expect(outcome.ok).toBe(true);
      const forkedId = outcome.ok ? outcome.value.forkedId! : '';
      expect((await routines.findVisible('user-1', forkedId))?.slots).toHaveLength(1);
    });

    it('translates a child id of an existing fork too, not just a fresh one', async () => {
      await routines.save(routine({ id: 'sample-1', userId: null, slots: ['slot-a', 'slot-b'] }));
      await editor.mutate('user-1', 'sample-1', (loaded) => loaded.rename('Mine', NOW));

      const outcome = await editor.mutate('user-1', 'sample-1', (loaded, translate) => {
        loaded.removeSlot(translate('slot-b'), NOW);
      });

      const forkedId = outcome.ok ? outcome.value.forkedId! : '';
      expect((await routines.findVisible('user-1', forkedId))?.slots).toHaveLength(1);
    });

    it('is not-found for a row belonging to someone else', async () => {
      await routines.save(routine({ id: 'theirs-1', userId: 'user-2' }));

      expect(await editor.mutate('user-1', 'theirs-1', () => {})).toEqual({ ok: false, error: 'not-found' });
    });

    it('is not-found for an id that does not exist', async () => {
      expect(await editor.mutate('user-1', 'missing', () => {})).toEqual({ ok: false, error: 'not-found' });
    });
  });

  describe('edit', () => {
    it('hands the resolved copy over and reports the fork the work landed on', async () => {
      await routines.save(routine({ id: 'sample-1', userId: null }));

      const outcome = await editor.edit('user-1', 'sample-1', async (copy) => {
        copy.editable.rename('Mine', NOW);
        await routines.save(copy.editable);
        return ok();
      });

      expect(outcome.ok && outcome.value.forkedId).toBeTruthy();
    });

    it("surfaces the work's own failure alongside not-found", async () => {
      await routines.save(routine({ id: 'own-1', userId: 'user-1' }));

      const outcome = await editor.edit('user-1', 'own-1', async () => err('exercise-not-found' as const));

      expect(outcome).toEqual({ ok: false, error: 'exercise-not-found' });
    });

    it('never runs the work when the row is not visible', async () => {
      let ran = false;

      await editor.edit('user-1', 'missing', async () => {
        ran = true;
        return ok();
      });

      expect(ran).toBe(false);
    });
  });

  describe('remove', () => {
    it("deletes the athlete's own row", async () => {
      await routines.save(routine({ id: 'own-1', userId: 'user-1' }));

      expect(await editor.remove('user-1', 'own-1')).toMatchObject({ ok: true });
      expect(await routines.findVisible('user-1', 'own-1')).toBeNull();
    });

    it("refuses a shared sample, which is not the athlete's to delete", async () => {
      await routines.save(routine({ id: 'sample-1', userId: null }));

      expect(await editor.remove('user-1', 'sample-1')).toEqual({ ok: false, error: 'sample' });
      expect(await routines.findVisible('user-1', 'sample-1')).not.toBeNull();
    });

    it("is not-found for someone else's row", async () => {
      await routines.save(routine({ id: 'theirs-1', userId: 'user-2' }));

      expect(await editor.remove('user-1', 'theirs-1')).toEqual({ ok: false, error: 'not-found' });
    });
  });

  describe('revert', () => {
    it('drops the copy and names the sample it came from', async () => {
      await routines.save(routine({ id: 'sample-1', userId: null }));
      await routines.save(routine({ id: 'fork-1', userId: 'user-1', forkedFromId: 'sample-1' }));

      expect(await editor.revert('user-1', 'fork-1')).toEqual({ ok: true, value: { forkedFromId: 'sample-1' } });
      expect(await routines.findVisible('user-1', 'fork-1')).toBeNull();
      // The sample reappears in the list now that nothing forks from it.
      expect((await routines.listFor('user-1', true)).map((found) => found.id)).toEqual(['sample-1']);
    });

    it('refuses a row that was never a copy of anything', async () => {
      await routines.save(routine({ id: 'own-1', userId: 'user-1' }));

      expect(await editor.revert('user-1', 'own-1')).toEqual({ ok: false, error: 'nothing-to-revert' });
    });

    it('refuses the sample itself', async () => {
      await routines.save(routine({ id: 'sample-1', userId: null }));

      expect(await editor.revert('user-1', 'sample-1')).toEqual({ ok: false, error: 'nothing-to-revert' });
    });
  });
});
