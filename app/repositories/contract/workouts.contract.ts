import { beforeEach, describe, expect, it } from 'vitest';

import { SetTarget } from '~/domain/workout/set-target';
import { Duration } from '~/domain/values/duration';

import { deps, exercise, ids, NOW, seedAthletes, workout, type ContractSubject, type RepositorySet } from './harness';

export function describeWorkoutsContract(subject: ContractSubject): void {
  describe('WorkoutsRepository', () => {
    let repositories: RepositorySet;

    async function seedExercises(count: number): Promise<string[]> {
      const exerciseIds = [ids.child, ids.otherChild, ids.extra].slice(0, count);
      for (const [index, id] of exerciseIds.entries()) {
        await repositories.exercises.save(exercise({ id, name: `Exercise ${index}` }));
      }
      return exerciseIds;
    }

    beforeEach(async () => {
      repositories = await subject.reset();
      await seedAthletes(repositories);
    });

    describe('findManyByIds', () => {
      /**
       * Importing a shared plan reads the workouts its slots name, and
       * those belong to whoever shared it - the share token is what gates
       * the read, not this method.
       */
      it('ignores visibility, so a shared plan can be read before it is imported', async () => {
        await repositories.workouts.save(workout({ id: ids.theirs, userId: ids.otherAthlete, name: 'Theirs' }));
        await repositories.workouts.save(workout({ id: ids.sample, userId: null, name: 'Sample day' }));

        const found = await repositories.workouts.findManyByIds([ids.theirs, ids.sample]);

        expect(found.map((one) => one.id).sort()).toEqual([ids.theirs, ids.sample].sort());
      });

      it('carries the exercise entries, in position order', async () => {
        const [first, second] = await seedExercises(2);
        const saved = workout({ id: ids.own });
        saved.addExercise(first!, SetTarget.none(), deps);
        saved.addExercise(second!, SetTarget.none(), deps);
        await repositories.workouts.save(saved);

        const [found] = await repositories.workouts.findManyByIds([ids.own]);

        expect(found?.exercises.map((entry) => entry.exerciseId)).toEqual([first, second]);
      });

      it('is empty for an empty id list, without querying', async () => {
        expect(await repositories.workouts.findManyByIds([])).toEqual([]);
      });

      it('skips ids that do not exist rather than returning a hole', async () => {
        await repositories.workouts.save(workout({ id: ids.own }));

        const found = await repositories.workouts.findManyByIds([ids.own, ids.extra]);

        expect(found.map((one) => one.id)).toEqual([ids.own]);
      });
    });

    it('lists most recently updated first', async () => {
      await repositories.workouts.save(workout({ id: ids.own, name: 'Older', updatedAt: new Date('2026-08-01T00:00:00Z') }));
      await repositories.workouts.save(workout({ id: ids.extra, name: 'Newer', updatedAt: new Date('2026-09-01T00:00:00Z') }));

      const names = (await repositories.workouts.listFor(ids.athlete, false)).map((found) => found.name);

      expect(names).toEqual(['Newer', 'Older']);
    });

    it('lists names in the same order and for the same set as listFor', async () => {
      await repositories.workouts.save(workout({ id: ids.own, name: 'Older', updatedAt: new Date('2026-08-01T00:00:00Z') }));
      await repositories.workouts.save(workout({ id: ids.extra, name: 'Newer', updatedAt: new Date('2026-09-01T00:00:00Z') }));
      await repositories.workouts.save(workout({ id: ids.sample, userId: null, name: 'Sample' }));

      for (const showSamples of [true, false]) {
        const full = await repositories.workouts.listFor(ids.athlete, showSamples);
        const names = await repositories.workouts.listNamesFor(ids.athlete, showSamples);

        expect(names).toEqual(full.map(({ id, name }) => ({ id, name })));
      }
    });

    describe('exercise entries', () => {
      it('round-trips entries, their positions and their targets', async () => {
        const [first, second] = await seedExercises(2);
        const saved = workout({ id: ids.own });
        saved.addExercise(first!, SetTarget.of({ sets: 3, reps: 8, weight: null }), deps);
        saved.addExercise(second!, SetTarget.none(), deps);
        await repositories.workouts.save(saved);

        const found = await repositories.workouts.findVisible(ids.athlete, ids.own);

        expect(found?.exercises.map((entry) => ({ exerciseId: entry.exerciseId, position: entry.position }))).toEqual([
          { exerciseId: first, position: 0 },
          { exerciseId: second, position: 1 },
        ]);
        expect(found?.exercises[0]!.target.toSnapshot()).toMatchObject({ targetSets: 3, targetReps: 8 });
      });

      it('round-trips a rest target', async () => {
        const [first] = await seedExercises(1);
        const saved = workout({ id: ids.own });
        saved.addExercise(first!, SetTarget.of({ rest: Duration.seconds(90) }), deps);
        await repositories.workouts.save(saved);

        const found = await repositories.workouts.findVisible(ids.athlete, ids.own);

        expect(found?.exercises[0]!.target.rest?.inSeconds).toBe(90);
      });

      it('closes the gap after a removal, leaving positions contiguous', async () => {
        const [first, second, third] = await seedExercises(3);
        const saved = workout({ id: ids.own });
        for (const exerciseId of [first!, second!, third!]) saved.addExercise(exerciseId, SetTarget.none(), deps);
        await repositories.workouts.save(saved);

        const entryId = saved.exercises[0]!.id;
        saved.removeExercise(entryId, NOW);
        await repositories.workouts.save(saved);

        const found = await repositories.workouts.findVisible(ids.athlete, ids.own);
        expect(found?.exercises.map((entry) => entry.position)).toEqual([0, 1]);
        expect(found?.exercises.map((entry) => entry.exerciseId)).toEqual([second, third]);
      });

      /**
       * The reason `write-positions.ts` exists: the unique `(workoutId,
       * position)` index is checked per statement, so a naive swap collides on
       * the intermediate state. Only a real database can fail this.
       */
      it('swaps two neighbours without tripping the position uniqueness', async () => {
        const [first, second] = await seedExercises(2);
        const saved = workout({ id: ids.own });
        saved.addExercise(first!, SetTarget.none(), deps);
        saved.addExercise(second!, SetTarget.none(), deps);
        await repositories.workouts.save(saved);

        saved.moveExercise(saved.exercises[0]!.id, 'down', NOW);
        await repositories.workouts.save(saved);

        const found = await repositories.workouts.findVisible(ids.athlete, ids.own);
        expect(found?.exercises.map((entry) => entry.exerciseId)).toEqual([second, first]);
        expect(found?.exercises.map((entry) => entry.position)).toEqual([0, 1]);
      });

      it('reverses a whole list in one save', async () => {
        const [first, second, third] = await seedExercises(3);
        const saved = workout({ id: ids.own });
        for (const exerciseId of [first!, second!, third!]) saved.addExercise(exerciseId, SetTarget.none(), deps);
        await repositories.workouts.save(saved);

        saved.moveExercise(saved.exercises[0]!.id, 'down', NOW);
        saved.moveExercise(saved.exercises[2]!.id, 'up', NOW);
        await repositories.workouts.save(saved);

        const found = await repositories.workouts.findVisible(ids.athlete, ids.own);
        expect(found?.exercises.map((entry) => entry.exerciseId)).toEqual(saved.exercises.map((entry) => entry.exerciseId));
        expect(found?.exercises.map((entry) => entry.position)).toEqual([0, 1, 2]);
      });

      it('changes a target in place without re-adding the entry', async () => {
        const [first] = await seedExercises(1);
        const saved = workout({ id: ids.own });
        const entry = saved.addExercise(first!, SetTarget.of({ sets: 3, reps: 8, weight: null }), deps);
        await repositories.workouts.save(saved);

        entry.retarget(SetTarget.of({ sets: 5, reps: 5, weight: null }));
        await repositories.workouts.save(saved);

        const found = await repositories.workouts.findVisible(ids.athlete, ids.own);
        expect(found?.exercises).toHaveLength(1);
        expect(found?.exercises[0]!.id).toBe(entry.id);
        expect(found?.exercises[0]!.target.toSnapshot()).toMatchObject({ targetSets: 5, targetReps: 5 });
      });
    });

    it('deletes a workout and its entries', async () => {
      const [first] = await seedExercises(1);
      const saved = workout({ id: ids.own });
      saved.addExercise(first!, SetTarget.none(), deps);
      await repositories.workouts.save(saved);

      await repositories.workouts.delete(ids.own);

      expect(await repositories.workouts.findVisible(ids.athlete, ids.own)).toBeNull();
      // The exercise itself outlives the workout that referenced it.
      expect(await repositories.exercises.findById(first!)).not.toBeNull();
    });
  });
}
