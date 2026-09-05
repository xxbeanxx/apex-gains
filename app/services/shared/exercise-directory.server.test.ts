import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Exercise } from '~/domain/exercise/exercise';
import { InMemoryExercisesRepository } from '~/repositories/in-memory/exercises-repository.server';

import { ExerciseDirectory } from './exercise-directory.server';

const NOW = new Date('2026-09-03T12:00:00Z');

function exercise(id: string, name: string, overrides: { type?: 'strength' | 'cardio'; equipment?: string[] } = {}) {
  return Exercise.fromSnapshot({
    id,
    userId: 'user-1',
    forkedFromId: null,
    name,
    exerciseType: overrides.type ?? 'strength',
    muscleGroup: null,
    description: null,
    createdAt: NOW,
    equipmentIds: overrides.equipment ?? [],
  });
}

describe('ExerciseDirectory', () => {
  let exercises: InMemoryExercisesRepository;

  beforeEach(async () => {
    exercises = new InMemoryExercisesRepository();
    await exercises.save(exercise('bench', 'Bench press', { equipment: ['barbell', 'bench'] }));
    await exercises.save(exercise('row', 'Rowing', { type: 'cardio', equipment: ['rower'] }));
  });

  it('resolves names and types by id', async () => {
    const directory = await ExerciseDirectory.of(['bench', 'row'], exercises);

    expect(directory.nameOf('bench')).toBe('Bench press');
    expect(directory.typeOf('row')).toBe('cardio');
  });

  /**
   * History outlives the library: a set can name an exercise that has since
   * been deleted, and the workout is still worth showing.
   */
  it('falls back for an id it never resolved', async () => {
    const directory = await ExerciseDirectory.of(['bench'], exercises);

    expect(directory.nameOf('deleted')).toBe('Unknown');
    expect(directory.typeOf('deleted')).toBe('strength');
    expect(directory.equipmentIdsOf('deleted')).toEqual([]);
  });

  it('asks the repository once, with each id only once', async () => {
    const findManyByIds = vi.spyOn(exercises, 'findManyByIds');

    await ExerciseDirectory.of(['bench', 'bench', 'row', 'bench'], exercises);

    expect(findManyByIds).toHaveBeenCalledTimes(1);
    expect(findManyByIds.mock.calls[0]![0]).toEqual(['bench', 'row']);
  });

  it('resolves nothing, and queries nothing extra, for no ids', async () => {
    const directory = await ExerciseDirectory.of([], exercises);

    expect(directory.exercises).toEqual([]);
    expect(directory.allEquipmentIds).toEqual([]);
  });

  it('exposes what it resolved, for a domain calculation over the whole span', async () => {
    const directory = await ExerciseDirectory.of(['bench', 'row'], exercises);

    expect(directory.exercises.map((found) => found.id).sort()).toEqual(['bench', 'row']);
  });

  describe('equipment', () => {
    it('reports the equipment one exercise links', async () => {
      const directory = await ExerciseDirectory.of(['bench'], exercises);

      expect([...directory.equipmentIdsOf('bench')].sort()).toEqual(['barbell', 'bench']);
    });

    it('collects every equipment id across the set, deduplicated', async () => {
      await exercises.save(exercise('press', 'Overhead press', { equipment: ['barbell'] }));
      const directory = await ExerciseDirectory.of(['bench', 'row', 'press'], exercises);

      expect(directory.allEquipmentIds.sort()).toEqual(['barbell', 'bench', 'rower']);
    });
  });
});
