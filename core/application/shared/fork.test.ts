import { beforeEach, describe, expect, it } from 'vitest';
import { ForkableLibrary } from '~application/shared/fork';
import { Plan } from '~domain/plan/plan';
import { fixedClock } from '~domain/shared/clock';
import { sequentialIds } from '~domain/shared/ids';
import { err, ok } from '~domain/shared/result';
import { sequentialSecrets } from '~domain/shared/secrets';
import { InMemoryPlansRepository } from '~infrastructure/persistence/in-memory/plans-repository';
import { inMemoryRepositories } from '~infrastructure/persistence/in-memory/repositories';

/**
 * `Plan` stands in for every forkable aggregate here: the editor is
 * generic, so what is under test is the sequence, not the aggregate. The
 * adapters are real - a fork resolved against a fake store would prove
 * nothing about whether a second fork gets minted.
 */
const NOW = new Date('2026-09-03T12:00:00Z');
const deps = { ids: sequentialIds('generated'), clock: fixedClock(NOW), secrets: sequentialSecrets('token') };

function plan(overrides: { id: string; userId: string | null; forkedFromId?: string | null; slots?: string[] }): Plan {
  return Plan.fromSnapshot({
    id: overrides.id,
    userId: overrides.userId,
    forkedFromId: overrides.forkedFromId ?? null,
    name: 'PPL',
    isActive: false,
    anchorDate: '2026-09-01',
    shareToken: null,
    createdAt: NOW,
    updatedAt: NOW,
    slots: (overrides.slots ?? []).map((id, position) => ({ id: id, position: position, workoutId: null })),
  });
}

describe('ForkableLibrary', () => {
  let plans: InMemoryPlansRepository;
  let editor: ForkableLibrary<Plan>;

  beforeEach(() => {
    const stores = inMemoryRepositories();
    plans = stores.plans;
    editor = new ForkableLibrary(plans, stores.unitOfWork, deps, (loaded) => loaded.slots);
  });

  describe('mutate', () => {
    it("applies to the athlete's own row in place, reporting no fork", async () => {
      await plans.save(plan({ id: 'own-1', userId: 'user-1' }));

      const outcome = await editor.mutate('user-1', 'own-1', (loaded) => loaded.rename('Upper/Lower', NOW));

      expect(outcome).toEqual({ ok: true, value: { forkedId: null } });
      expect((await plans.findVisible('user-1', 'own-1'))?.name).toBe('Upper/Lower');
    });

    it('forks a sample on first edit, leaving the shared original untouched', async () => {
      await plans.save(plan({ id: 'sample-1', userId: null }));

      const outcome = await editor.mutate('user-1', 'sample-1', (loaded) => loaded.rename('Mine', NOW));

      expect(outcome.ok).toBe(true);
      const forkedId = outcome.ok ? outcome.value.forkedId : null;
      expect(forkedId).not.toBeNull();
      expect((await plans.findVisible('user-1', forkedId!))?.name).toBe('Mine');
      expect((await plans.findVisible('user-1', 'sample-1'))?.name).toBe('PPL');
    });

    it('reuses an existing fork rather than minting a second one', async () => {
      await plans.save(plan({ id: 'sample-1', userId: null }));

      const first = await editor.mutate('user-1', 'sample-1', (loaded) => loaded.rename('First', NOW));
      const second = await editor.mutate('user-1', 'sample-1', (loaded) => loaded.rename('Second', NOW));

      expect(first.ok && second.ok && second.value.forkedId).toBe(first.ok ? first.value.forkedId : null);
      expect(await plans.listFor('user-1', true)).toHaveLength(1);
    });

    /**
     * A fork's children get new ids, so an id that arrived on a form names a
     * child of the *sample*. It has to be translated onto the copy by
     * position, or the edit lands on nothing.
     */
    it('translates a child id from the sample onto the copy', async () => {
      await plans.save(plan({ id: 'sample-1', userId: null, slots: ['slot-a', 'slot-b'] }));

      const outcome = await editor.mutate('user-1', 'sample-1', (loaded, translate) => {
        loaded.removeSlot(translate('slot-a'), NOW);
      });

      expect(outcome.ok).toBe(true);
      const forkedId = outcome.ok ? outcome.value.forkedId! : '';
      expect((await plans.findVisible('user-1', forkedId))?.slots).toHaveLength(1);
    });

    it('translates a child id of an existing fork too, not just a fresh one', async () => {
      await plans.save(plan({ id: 'sample-1', userId: null, slots: ['slot-a', 'slot-b'] }));
      await editor.mutate('user-1', 'sample-1', (loaded) => loaded.rename('Mine', NOW));

      const outcome = await editor.mutate('user-1', 'sample-1', (loaded, translate) => {
        loaded.removeSlot(translate('slot-b'), NOW);
      });

      const forkedId = outcome.ok ? outcome.value.forkedId! : '';
      expect((await plans.findVisible('user-1', forkedId))?.slots).toHaveLength(1);
    });

    it('is not-found for a row belonging to someone else', async () => {
      await plans.save(plan({ id: 'theirs-1', userId: 'user-2' }));

      expect(await editor.mutate('user-1', 'theirs-1', () => {})).toEqual({ ok: false, error: 'not-found' });
    });

    it('is not-found for an id that does not exist', async () => {
      expect(await editor.mutate('user-1', 'missing', () => {})).toEqual({ ok: false, error: 'not-found' });
    });
  });

  describe('edit', () => {
    it('hands the resolved copy over and reports the fork the work landed on', async () => {
      await plans.save(plan({ id: 'sample-1', userId: null }));

      const outcome = await editor.edit('user-1', 'sample-1', async (copy) => {
        copy.editable.rename('Mine', NOW);
        await plans.save(copy.editable);
        return ok();
      });

      expect(outcome.ok && outcome.value.forkedId).toBeTruthy();
    });

    it("surfaces the work's own failure alongside not-found", async () => {
      await plans.save(plan({ id: 'own-1', userId: 'user-1' }));

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
      await plans.save(plan({ id: 'own-1', userId: 'user-1' }));

      expect(await editor.remove('user-1', 'own-1')).toMatchObject({ ok: true });
      expect(await plans.findVisible('user-1', 'own-1')).toBeNull();
    });

    it("refuses a shared sample, which is not the athlete's to delete", async () => {
      await plans.save(plan({ id: 'sample-1', userId: null }));

      expect(await editor.remove('user-1', 'sample-1')).toEqual({ ok: false, error: 'sample' });
      expect(await plans.findVisible('user-1', 'sample-1')).not.toBeNull();
    });

    it("is not-found for someone else's row", async () => {
      await plans.save(plan({ id: 'theirs-1', userId: 'user-2' }));

      expect(await editor.remove('user-1', 'theirs-1')).toEqual({ ok: false, error: 'not-found' });
    });
  });

  describe('revert', () => {
    it('drops the copy and names the sample it came from', async () => {
      await plans.save(plan({ id: 'sample-1', userId: null }));
      await plans.save(plan({ id: 'fork-1', userId: 'user-1', forkedFromId: 'sample-1' }));

      expect(await editor.revert('user-1', 'fork-1')).toEqual({ ok: true, value: { forkedFromId: 'sample-1' } });
      expect(await plans.findVisible('user-1', 'fork-1')).toBeNull();
      // The sample reappears in the list now that nothing forks from it.
      expect((await plans.listFor('user-1', true)).map((found) => found.id)).toEqual(['sample-1']);
    });

    it('refuses a row that was never a copy of anything', async () => {
      await plans.save(plan({ id: 'own-1', userId: 'user-1' }));

      expect(await editor.revert('user-1', 'own-1')).toEqual({ ok: false, error: 'nothing-to-revert' });
    });

    it('refuses the sample itself', async () => {
      await plans.save(plan({ id: 'sample-1', userId: null }));

      expect(await editor.revert('user-1', 'sample-1')).toEqual({ ok: false, error: 'nothing-to-revert' });
    });
  });

  describe('duplicate', () => {
    const copyOf = (source: Plan) => source.copyForImport('user-1', source.anchorDate, (workoutId) => workoutId, deps);

    it('copies a sample into a plain personal row named "<name> (copy)", not a fork of it', async () => {
      await plans.save(plan({ id: 'sample-1', userId: null }));

      const outcome = await editor.duplicate('user-1', true, 'sample-1', copyOf);

      const copy = await plans.findVisible('user-1', outcome.ok ? outcome.value.id : '');
      expect(copy).toMatchObject({ name: 'PPL (copy)', forkedFromId: null });
      expect(copy?.ownership.isSample).toBe(false);
      // Not a fork, so the sample still shows alongside the copy.
      expect((await plans.listFor('user-1', true)).map((found) => found.name).sort()).toEqual(['PPL', 'PPL (copy)']);
    });

    it('numbers each further copy past the names already in the library', async () => {
      await plans.save(plan({ id: 'own-1', userId: 'user-1' }));

      await editor.duplicate('user-1', true, 'own-1', copyOf);
      const second = await editor.duplicate('user-1', true, 'own-1', copyOf);

      expect((await plans.findVisible('user-1', second.ok ? second.value.id : ''))?.name).toBe('PPL (copy 2)');
    });

    it("is not-found for someone else's row, and copies nothing", async () => {
      await plans.save(plan({ id: 'theirs-1', userId: 'user-2' }));

      expect(await editor.duplicate('user-1', true, 'theirs-1', copyOf)).toEqual({ ok: false, error: 'not-found' });
      expect(await plans.listFor('user-1', false)).toEqual([]);
    });
  });
});
