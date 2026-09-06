import { beforeEach, describe, expect, it } from 'vitest';

import { deps, ids, NOW, plan, seedAthletes, workout, type ContractSubject, type RepositorySet } from './harness';

export function describePlansContract(subject: ContractSubject): void {
  describe('PlansRepository', () => {
    let repositories: RepositorySet;

    async function seedWorkouts(count: number): Promise<string[]> {
      const workoutIds = [ids.child, ids.otherChild, ids.extra].slice(0, count);
      for (const [index, id] of workoutIds.entries()) {
        await repositories.workouts.save(workout({ id, name: `Workout ${index}` }));
      }
      return workoutIds;
    }

    beforeEach(async () => {
      repositories = await subject.reset();
      await seedAthletes(repositories);
    });

    it('lists most recently updated first', async () => {
      await repositories.plans.save(plan({ id: ids.own, name: 'Older', updatedAt: new Date('2026-08-01T00:00:00Z') }));
      await repositories.plans.save(plan({ id: ids.extra, name: 'Newer', updatedAt: new Date('2026-09-01T00:00:00Z') }));

      const names = (await repositories.plans.listFor(ids.athlete, false)).map((found) => found.name);

      expect(names).toEqual(['Newer', 'Older']);
    });

    it('lists names in the same order and for the same set as listFor', async () => {
      await repositories.plans.save(plan({ id: ids.own, name: 'Older', updatedAt: new Date('2026-08-01T00:00:00Z') }));
      await repositories.plans.save(plan({ id: ids.extra, name: 'Newer', updatedAt: new Date('2026-09-01T00:00:00Z') }));
      await repositories.plans.save(plan({ id: ids.sample, userId: null, name: 'Sample' }));

      for (const showSamples of [true, false]) {
        const full = await repositories.plans.listFor(ids.athlete, showSamples);
        const names = await repositories.plans.listNamesFor(ids.athlete, showSamples);

        expect(names).toEqual(full.map(({ id, name }) => ({ id, name })));
      }
    });

    it('round-trips the anchor date as a calendar day, not a timestamp', async () => {
      await repositories.plans.save(plan({ id: ids.own, anchorDate: '2026-01-31' }));

      const found = await repositories.plans.findVisible(ids.athlete, ids.own);

      expect(found?.anchorDate.value).toBe('2026-01-31');
    });

    describe('share tokens', () => {
      /**
       * The lookup is deliberately unscoped by user - the token is the whole
       * of the authorization, and the athlete importing is never the owner.
       */
      it('finds a plan by its share token, whoever owns it', async () => {
        const shared = plan({ id: ids.own });
        shared.share(deps);
        await repositories.plans.save(shared);

        const found = await repositories.plans.findByShareToken(shared.shareToken!);

        expect(found?.id).toBe(ids.own);
      });

      it('answers with nothing for a token that was revoked', async () => {
        const shared = plan({ id: ids.own });
        const token = shared.share(deps);
        await repositories.plans.save(shared);

        shared.unshare(NOW);
        await repositories.plans.save(shared);

        expect(await repositories.plans.findByShareToken(token)).toBeNull();
        expect((await repositories.plans.findVisible(ids.athlete, ids.own))?.shareToken).toBeNull();
      });

      it('round-trips a token through save and load', async () => {
        const shared = plan({ id: ids.own });
        const token = shared.share(deps);
        await repositories.plans.save(shared);

        expect((await repositories.plans.findVisible(ids.athlete, ids.own))?.shareToken).toBe(token);
      });

      it('answers with nothing for an unknown token', async () => {
        await repositories.plans.save(plan({ id: ids.own }));

        expect(await repositories.plans.findByShareToken('nobody-minted-this')).toBeNull();
      });
    });

    describe('slots', () => {
      it('round-trips slots and their positions, rest days included', async () => {
        const [first] = await seedWorkouts(1);
        const saved = plan({ id: ids.own });
        saved.addSlot(first!, deps);
        saved.addSlot(null, deps);
        await repositories.plans.save(saved);

        const found = await repositories.plans.findVisible(ids.athlete, ids.own);

        expect(found?.slots.map((slot) => ({ workoutId: slot.workoutId, position: slot.position }))).toEqual([
          { workoutId: first, position: 0 },
          { workoutId: null, position: 1 },
        ]);
        expect(found?.slots[1]!.isRestDay).toBe(true);
      });

      it('closes the gap after a removal', async () => {
        const [first, second] = await seedWorkouts(2);
        const saved = plan({ id: ids.own });
        saved.addSlot(first!, deps);
        saved.addSlot(second!, deps);
        saved.addSlot(null, deps);
        await repositories.plans.save(saved);

        saved.removeSlot(saved.slots[0]!.id, NOW);
        await repositories.plans.save(saved);

        const found = await repositories.plans.findVisible(ids.athlete, ids.own);
        expect(found?.slots.map((slot) => slot.position)).toEqual([0, 1]);
        expect(found?.slots.map((slot) => slot.workoutId)).toEqual([second, null]);
      });

      /** Same per-statement uniqueness hazard as a workout's exercises. */
      it('swaps two neighbours without tripping the position uniqueness', async () => {
        const [first, second] = await seedWorkouts(2);
        const saved = plan({ id: ids.own });
        saved.addSlot(first!, deps);
        saved.addSlot(second!, deps);
        await repositories.plans.save(saved);

        saved.moveSlot(saved.slots[0]!.id, 'down', NOW);
        await repositories.plans.save(saved);

        const found = await repositories.plans.findVisible(ids.athlete, ids.own);
        expect(found?.slots.map((slot) => slot.workoutId)).toEqual([second, first]);
        expect(found?.slots.map((slot) => slot.position)).toEqual([0, 1]);
      });
    });

    describe('findActive', () => {
      it("finds the athlete's active plan", async () => {
        await repositories.plans.save(plan({ id: ids.own, isActive: false }));
        await repositories.plans.save(plan({ id: ids.extra, isActive: true }));

        expect((await repositories.plans.findActive(ids.athlete))?.id).toBe(ids.extra);
      });

      it('is null when nothing is active', async () => {
        await repositories.plans.save(plan({ id: ids.own, isActive: false }));

        expect(await repositories.plans.findActive(ids.athlete)).toBeNull();
      });

      it("does not return another athlete's active plan", async () => {
        await repositories.plans.save(plan({ id: ids.theirs, userId: ids.otherAthlete, isActive: true }));

        expect(await repositories.plans.findActive(ids.athlete)).toBeNull();
      });

      /**
       * A partial unique index refuses two active plans per athlete, so
       * standing the old one down and raising the new one must reach the
       * database as one unit. This is the only test that can catch a save
       * order that commits the intermediate state.
       */
      it('lets one plan replace another as active inside a unit of work', async () => {
        const first = plan({ id: ids.own, isActive: true });
        await repositories.plans.save(first);
        const second = plan({ id: ids.extra, isActive: false });
        await repositories.plans.save(second);

        await repositories.unitOfWork.run(async () => {
          first.deactivate(NOW);
          second.activate(NOW);
          await repositories.plans.save(first);
          await repositories.plans.save(second);
        });

        expect((await repositories.plans.findActive(ids.athlete))?.id).toBe(ids.extra);
      });
    });

    it('deletes a plan and its slots', async () => {
      const [first] = await seedWorkouts(1);
      const saved = plan({ id: ids.own });
      saved.addSlot(first!, deps);
      await repositories.plans.save(saved);

      await repositories.plans.delete(ids.own);

      expect(await repositories.plans.findVisible(ids.athlete, ids.own)).toBeNull();
      // The workout the slot pointed at outlives the plan.
      expect(await repositories.workouts.findVisible(ids.athlete, first!)).not.toBeNull();
    });
  });
}
