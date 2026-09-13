import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ReferenceDirectory } from '~application/shared/reference-directory';
import { Equipment } from '~domain/equipment/equipment';
import { Exercise, type ExerciseSnapshot } from '~domain/exercise/exercise';
import { Workout, type WorkoutSnapshot } from '~domain/workout/workout';
import { InMemoryEquipmentRepository } from '~infrastructure/persistence/in-memory/equipment-repository';
import { InMemoryExercisesRepository } from '~infrastructure/persistence/in-memory/exercises-repository';
import { inMemoryRepositories } from '~infrastructure/persistence/in-memory/repositories';
import { InMemoryWorkoutsRepository } from '~infrastructure/persistence/in-memory/workouts-repository';

const NOW = new Date('2026-09-03T12:00:00Z');

function exercise(overrides: Partial<ExerciseSnapshot> & { id: string }): Exercise {
  return Exercise.fromSnapshot({
    userId: null,
    forkedFromId: null,
    name: overrides.id,
    exerciseType: 'strength',
    muscleGroup: null,
    description: null,
    createdAt: NOW,
    equipmentIds: [],
    ...overrides,
  });
}

function workout(overrides: Partial<WorkoutSnapshot> & { id: string }): Workout {
  return Workout.fromSnapshot({
    userId: null,
    forkedFromId: null,
    name: overrides.id,
    createdAt: NOW,
    updatedAt: NOW,
    exercises: [],
    ...overrides,
  });
}

let exercises: InMemoryExercisesRepository;
let workouts: InMemoryWorkoutsRepository;
let equipment: InMemoryEquipmentRepository;
let directory: ReferenceDirectory;

beforeEach(async () => {
  const stores = inMemoryRepositories();
  exercises = stores.exercises;
  workouts = stores.workouts;
  equipment = stores.equipment;
  directory = new ReferenceDirectory(exercises, workouts, equipment);

  // A sample exercise and workout, each forked by user-1 and by user-2.
  await exercises.save(exercise({ id: 'row', name: 'Rowing' }));
  await exercises.save(exercise({ id: 'my-row', userId: 'user-1', forkedFromId: 'row', name: 'My rowing' }));
  await exercises.save(exercise({ id: 'their-row', userId: 'user-2', forkedFromId: 'row', name: 'Their rowing' }));
  await exercises.save(exercise({ id: 'bench', userId: 'user-1', name: 'Bench press' }));

  await workouts.save(workout({ id: 'push', name: 'Push day' }));
  await workouts.save(workout({ id: 'my-push', userId: 'user-1', forkedFromId: 'push', name: 'My push day' }));
  await workouts.save(workout({ id: 'their-push', userId: 'user-2', forkedFromId: 'push', name: 'Their push day' }));
});

describe('historical', () => {
  it('resolves each id to exactly the row it names, even a sample the athlete has forked', async () => {
    const resolved = await directory.historical({ exerciseIds: ['row', 'bench'], workoutIds: ['push'] });

    expect(resolved.exercise('row')).toMatchObject({ id: 'row', name: 'Rowing' });
    expect(resolved.exercise('bench')).toMatchObject({ id: 'bench', name: 'Bench press' });
    expect(resolved.workoutName('push')).toBe('Push day');
    expect(resolved.workout('push')?.id).toBe('push');
  });

  it('never asks for forks', async () => {
    const exerciseForks = vi.spyOn(exercises, 'findForksOf');
    const workoutForks = vi.spyOn(workouts, 'findForksOf');

    await directory.historical({ exerciseIds: ['row'], workoutIds: ['push'] });

    expect(exerciseForks).not.toHaveBeenCalled();
    expect(workoutForks).not.toHaveBeenCalled();
  });

  it('exposes every exercise it resolved, for a calculation over the whole span', async () => {
    const resolved = await directory.historical({ exerciseIds: ['row', 'bench', 'row'] });

    expect(resolved.exercises.map((found) => found.id).sort()).toEqual(['bench', 'row']);
  });
});

describe('forwardLooking', () => {
  it("resolves a sample to the athlete's own fork of it", async () => {
    const resolved = await directory.forwardLooking('user-1', { exerciseIds: ['row'], workoutIds: ['push'] });

    expect(resolved.exercise('row')).toMatchObject({ id: 'my-row', name: 'My rowing' });
    expect(resolved.workoutName('push')).toBe('My push day');
    expect(resolved.workout('push')?.id).toBe('my-push');
  });

  it("never resolves to another athlete's fork", async () => {
    const resolved = await directory.forwardLooking('user-3', { exerciseIds: ['row'], workoutIds: ['push'] });

    expect(resolved.exercise('row')).toMatchObject({ id: 'row', name: 'Rowing' });
    expect(resolved.workout('push')?.id).toBe('push');
  });

  it('resolves an own row, and a sample with no fork, to itself', async () => {
    await exercises.save(exercise({ id: 'squat', name: 'Squat' }));

    const resolved = await directory.forwardLooking('user-1', { exerciseIds: ['bench', 'squat'] });

    expect(resolved.exercise('bench').id).toBe('bench');
    expect(resolved.exercise('squat').id).toBe('squat');
  });
});

describe('cardio fields', () => {
  beforeEach(async () => {
    await equipment.save(
      Equipment.fromSnapshot({ id: 'rower', userId: null, name: 'Rower', cardioKind: 'resistance', createdAt: NOW }),
    );
    await equipment.save(
      Equipment.fromSnapshot({ id: 'treadmill', userId: null, name: 'Treadmill', cardioKind: 'speed', createdAt: NOW }),
    );
  });

  it("decides them from the resolved exercise's own equipment", async () => {
    await exercises.save(exercise({ id: 'row', name: 'Rowing', exerciseType: 'cardio', equipmentIds: ['treadmill'] }));
    await exercises.save(
      exercise({ id: 'my-row', userId: 'user-1', forkedFromId: 'row', exerciseType: 'cardio', equipmentIds: ['rower'] }),
    );

    const historical = await directory.historical({ exerciseIds: ['row'] });
    const forward = await directory.forwardLooking('user-1', { exerciseIds: ['row'] });

    expect(historical.exercise('row').cardioFields).toEqual({ showSpeed: true, showResistance: false });
    expect(forward.exercise('row').cardioFields).toEqual({ showSpeed: false, showResistance: true });
  });

  it('asks for equipment once, and not at all when nothing links any', async () => {
    const findEquipment = vi.spyOn(equipment, 'findManyByIds');

    await directory.historical({ exerciseIds: ['row', 'bench'] });
    expect(findEquipment).not.toHaveBeenCalled();

    await exercises.save(exercise({ id: 'row', equipmentIds: ['rower'] }));
    await exercises.save(exercise({ id: 'bench', userId: 'user-1', equipmentIds: ['rower', 'treadmill'] }));
    await directory.historical({ exerciseIds: ['row', 'bench'] });

    expect(findEquipment).toHaveBeenCalledTimes(1);
    expect([...findEquipment.mock.calls[0]![0]].sort()).toEqual(['rower', 'treadmill']);
  });
});

describe('queries', () => {
  it('asks each repository once, with each id only once', async () => {
    const findExercises = vi.spyOn(exercises, 'findManyByIds');
    const findForks = vi.spyOn(exercises, 'findForksOf');

    await directory.forwardLooking('user-1', { exerciseIds: ['row', 'bench', 'row', 'bench'] });

    expect(findForks).toHaveBeenCalledTimes(1);
    expect(findForks.mock.calls[0]![1]).toEqual(['row', 'bench']);
    // The fork already answered for `row`.
    expect(findExercises).toHaveBeenCalledTimes(1);
    expect(findExercises.mock.calls[0]![0]).toEqual(['bench']);
  });

  it('queries nothing for a kind that names no ids', async () => {
    const findExercises = vi.spyOn(exercises, 'findManyByIds');
    const findWorkouts = vi.spyOn(workouts, 'findManyByIds');
    const findWorkoutForks = vi.spyOn(workouts, 'findForksOf');

    const resolved = await directory.forwardLooking('user-1', { exerciseIds: [] });

    expect(findExercises).not.toHaveBeenCalled();
    expect(findWorkouts).not.toHaveBeenCalled();
    expect(findWorkoutForks).not.toHaveBeenCalled();
    expect(resolved.exercises).toEqual([]);
  });
});

/**
 * The schema keeps a referenced exercise from being deleted and nulls a
 * deleted workout's references, so by id these only guard against broken
 * data - but one bad row should not take a page down.
 */
describe('an id that resolves to nothing', () => {
  it('falls back to a labelled strength exercise offering every cardio field', async () => {
    const resolved = await directory.historical({ exerciseIds: ['gone'] });

    expect(resolved.exercise('gone')).toEqual({
      id: 'gone',
      name: 'Unknown',
      exerciseType: 'strength',
      cardioFields: { showSpeed: true, showResistance: true },
    });
  });

  it('names a missing workout "Unknown" and yields no aggregate for it', async () => {
    const resolved = await directory.historical({ workoutIds: ['gone'] });

    expect(resolved.workoutName('gone')).toBe('Unknown');
    expect(resolved.workout('gone')).toBeNull();
  });

  it('treats an id it was never asked about the same way', async () => {
    const resolved = await directory.historical({});

    expect(resolved.exercise('row').name).toBe('Unknown');
    expect(resolved.workoutName('push')).toBe('Unknown');
  });
});
