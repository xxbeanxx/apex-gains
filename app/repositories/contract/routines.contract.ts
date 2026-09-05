import { beforeEach, describe, expect, it } from 'vitest';

import { deps, ids, NOW, routine, seedAthletes, template, type ContractSubject, type RepositorySet } from './harness';

export function describeRoutinesContract(subject: ContractSubject): void {
  describe('RoutinesRepository', () => {
    let repositories: RepositorySet;

    async function seedTemplates(count: number): Promise<string[]> {
      const templateIds = [ids.child, ids.otherChild, ids.extra].slice(0, count);
      for (const [index, id] of templateIds.entries()) {
        await repositories.templates.save(template({ id, name: `Template ${index}` }));
      }
      return templateIds;
    }

    beforeEach(async () => {
      repositories = await subject.reset();
      await seedAthletes(repositories);
    });

    it('lists most recently updated first', async () => {
      await repositories.routines.save(routine({ id: ids.own, name: 'Older', updatedAt: new Date('2026-08-01T00:00:00Z') }));
      await repositories.routines.save(routine({ id: ids.extra, name: 'Newer', updatedAt: new Date('2026-09-01T00:00:00Z') }));

      const names = (await repositories.routines.listFor(ids.athlete, false)).map((found) => found.name);

      expect(names).toEqual(['Newer', 'Older']);
    });

    it('round-trips the anchor date as a calendar day, not a timestamp', async () => {
      await repositories.routines.save(routine({ id: ids.own, anchorDate: '2026-01-31' }));

      const found = await repositories.routines.findVisible(ids.athlete, ids.own);

      expect(found?.anchorDate.value).toBe('2026-01-31');
    });

    describe('slots', () => {
      it('round-trips slots and their positions, rest days included', async () => {
        const [first] = await seedTemplates(1);
        const saved = routine({ id: ids.own });
        saved.addSlot(first!, deps);
        saved.addSlot(null, deps);
        await repositories.routines.save(saved);

        const found = await repositories.routines.findVisible(ids.athlete, ids.own);

        expect(found?.slots.map((slot) => ({ templateId: slot.templateId, position: slot.position }))).toEqual([
          { templateId: first, position: 0 },
          { templateId: null, position: 1 },
        ]);
        expect(found?.slots[1]!.isRestDay).toBe(true);
      });

      it('closes the gap after a removal', async () => {
        const [first, second] = await seedTemplates(2);
        const saved = routine({ id: ids.own });
        saved.addSlot(first!, deps);
        saved.addSlot(second!, deps);
        saved.addSlot(null, deps);
        await repositories.routines.save(saved);

        saved.removeSlot(saved.slots[0]!.id, NOW);
        await repositories.routines.save(saved);

        const found = await repositories.routines.findVisible(ids.athlete, ids.own);
        expect(found?.slots.map((slot) => slot.position)).toEqual([0, 1]);
        expect(found?.slots.map((slot) => slot.templateId)).toEqual([second, null]);
      });

      /** Same per-statement uniqueness hazard as a template's exercises. */
      it('swaps two neighbours without tripping the position uniqueness', async () => {
        const [first, second] = await seedTemplates(2);
        const saved = routine({ id: ids.own });
        saved.addSlot(first!, deps);
        saved.addSlot(second!, deps);
        await repositories.routines.save(saved);

        saved.moveSlot(saved.slots[0]!.id, 'down', NOW);
        await repositories.routines.save(saved);

        const found = await repositories.routines.findVisible(ids.athlete, ids.own);
        expect(found?.slots.map((slot) => slot.templateId)).toEqual([second, first]);
        expect(found?.slots.map((slot) => slot.position)).toEqual([0, 1]);
      });
    });

    describe('findActive', () => {
      it("finds the athlete's active routine", async () => {
        await repositories.routines.save(routine({ id: ids.own, isActive: false }));
        await repositories.routines.save(routine({ id: ids.extra, isActive: true }));

        expect((await repositories.routines.findActive(ids.athlete))?.id).toBe(ids.extra);
      });

      it('is null when nothing is active', async () => {
        await repositories.routines.save(routine({ id: ids.own, isActive: false }));

        expect(await repositories.routines.findActive(ids.athlete)).toBeNull();
      });

      it("does not return another athlete's active routine", async () => {
        await repositories.routines.save(routine({ id: ids.theirs, userId: ids.otherAthlete, isActive: true }));

        expect(await repositories.routines.findActive(ids.athlete)).toBeNull();
      });

      /**
       * A partial unique index refuses two active routines per athlete, so
       * standing the old one down and raising the new one must reach the
       * database as one unit. This is the only test that can catch a save
       * order that commits the intermediate state.
       */
      it('lets one routine replace another as active inside a unit of work', async () => {
        const first = routine({ id: ids.own, isActive: true });
        await repositories.routines.save(first);
        const second = routine({ id: ids.extra, isActive: false });
        await repositories.routines.save(second);

        await repositories.unitOfWork.run(async () => {
          first.deactivate(NOW);
          second.activate(NOW);
          await repositories.routines.save(first);
          await repositories.routines.save(second);
        });

        expect((await repositories.routines.findActive(ids.athlete))?.id).toBe(ids.extra);
      });
    });

    it('deletes a routine and its slots', async () => {
      const [first] = await seedTemplates(1);
      const saved = routine({ id: ids.own });
      saved.addSlot(first!, deps);
      await repositories.routines.save(saved);

      await repositories.routines.delete(ids.own);

      expect(await repositories.routines.findVisible(ids.athlete, ids.own)).toBeNull();
      // The template the slot pointed at outlives the routine.
      expect(await repositories.templates.findVisible(ids.athlete, first!)).not.toBeNull();
    });
  });
}
