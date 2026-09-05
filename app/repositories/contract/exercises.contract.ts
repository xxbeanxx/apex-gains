import { beforeEach, describe, expect, it } from 'vitest';

import { SetTarget } from '~/domain/template/set-target';

import {
  deps,
  equipmentItem,
  exercise,
  ids,
  seedAthletes,
  template,
  type ContractSubject,
  type RepositorySet,
} from './harness';

export function describeExercisesContract(subject: ContractSubject): void {
  describe('ExercisesRepository', () => {
    let repositories: RepositorySet;

    beforeEach(async () => {
      repositories = await subject.reset();
      await seedAthletes(repositories);
    });

    it('lists alphabetically by name, whatever order rows were saved in', async () => {
      await repositories.exercises.save(exercise({ id: ids.own, name: 'Squat' }));
      await repositories.exercises.save(exercise({ id: ids.extra, name: 'Bench press' }));
      await repositories.exercises.save(exercise({ id: ids.child, name: 'Deadlift' }));

      const names = (await repositories.exercises.listFor(ids.athlete, false)).map((found) => found.name);

      expect(names).toEqual(['Bench press', 'Deadlift', 'Squat']);
    });

    it('round-trips every field of an exercise', async () => {
      await repositories.exercises.save(
        exercise({ id: ids.own, name: 'Rowing', exerciseType: 'cardio', muscleGroup: 'back', description: 'Steady state' }),
      );

      const found = await repositories.exercises.findById(ids.own);

      expect(found?.toSnapshot()).toMatchObject({
        id: ids.own,
        userId: ids.athlete,
        name: 'Rowing',
        exerciseType: 'cardio',
        muscleGroup: 'back',
        description: 'Steady state',
      });
    });

    it('saves an existing exercise as an update rather than a second row', async () => {
      const saved = exercise({ id: ids.own, name: 'Bench press' });
      await repositories.exercises.save(saved);

      saved.updateDetails({ name: 'Incline bench', exerciseType: 'strength', muscleGroup: 'chest', description: null });
      await repositories.exercises.save(saved);

      const listed = await repositories.exercises.listFor(ids.athlete, false);
      expect(listed).toHaveLength(1);
      expect(listed[0]!.name).toBe('Incline bench');
    });

    it('persists equipment links, and drops the ones removed', async () => {
      await repositories.equipment.save(equipmentItem(ids.child, 'Bench'));
      await repositories.equipment.save(equipmentItem(ids.otherChild, 'Barbell'));

      const saved = exercise({ id: ids.own });
      saved.setEquipment(ids.child, true);
      saved.setEquipment(ids.otherChild, true);
      await repositories.exercises.save(saved);

      expect([...((await repositories.exercises.findById(ids.own))?.equipmentIds ?? [])].sort()).toEqual(
        [ids.child, ids.otherChild].sort(),
      );

      saved.setEquipment(ids.child, false);
      await repositories.exercises.save(saved);

      expect((await repositories.exercises.findById(ids.own))?.equipmentIds).toEqual([ids.otherChild]);
    });

    describe('findManyByIds', () => {
      it('ignores visibility, so history can still name a forked-away sample', async () => {
        await repositories.exercises.save(exercise({ id: ids.sample, userId: null, name: 'Sample press' }));
        await repositories.exercises.save(exercise({ id: ids.fork, forkedFromId: ids.sample, name: 'My press' }));
        await repositories.exercises.save(exercise({ id: ids.theirs, userId: ids.otherAthlete, name: 'Theirs' }));

        const found = await repositories.exercises.findManyByIds([ids.sample, ids.theirs]);

        expect(found.map((one) => one.id).sort()).toEqual([ids.sample, ids.theirs].sort());
      });

      it('is empty for an empty id list, without querying', async () => {
        expect(await repositories.exercises.findManyByIds([])).toEqual([]);
      });

      it('skips ids that do not exist rather than returning a hole', async () => {
        await repositories.exercises.save(exercise({ id: ids.own }));

        const found = await repositories.exercises.findManyByIds([ids.own, ids.extra]);

        expect(found.map((one) => one.id)).toEqual([ids.own]);
      });
    });

    describe('findOwnByName', () => {
      it("matches the athlete's own exercise by exact name", async () => {
        await repositories.exercises.save(exercise({ id: ids.own, name: 'Bench press' }));

        expect((await repositories.exercises.findOwnByName(ids.athlete, 'Bench press'))?.id).toBe(ids.own);
      });

      it('does not match a sample, which the athlete does not own', async () => {
        await repositories.exercises.save(exercise({ id: ids.sample, userId: null, name: 'Bench press' }));

        expect(await repositories.exercises.findOwnByName(ids.athlete, 'Bench press')).toBeNull();
      });

      it("does not match another athlete's exercise of the same name", async () => {
        await repositories.exercises.save(exercise({ id: ids.theirs, userId: ids.otherAthlete, name: 'Bench press' }));

        expect(await repositories.exercises.findOwnByName(ids.athlete, 'Bench press')).toBeNull();
      });
    });

    describe('delete', () => {
      it('removes an exercise nothing points at', async () => {
        await repositories.exercises.save(exercise({ id: ids.own }));

        expect(await repositories.exercises.delete(ids.own)).toBe('deleted');
        expect(await repositories.exercises.findById(ids.own)).toBeNull();
      });

      it('refuses to delete an exercise a template still points at', async () => {
        await repositories.exercises.save(exercise({ id: ids.own }));
        const owningTemplate = template({ id: ids.extra });
        owningTemplate.addExercise(ids.own, SetTarget.none(), deps);
        await repositories.templates.save(owningTemplate);

        expect(await repositories.exercises.delete(ids.own)).toBe('in-use');
        expect(await repositories.exercises.findById(ids.own)).not.toBeNull();
      });

      it('reports a delete of an id that is not there as deleted, not in-use', async () => {
        expect(await repositories.exercises.delete(ids.extra)).toBe('deleted');
      });
    });
  });
}
