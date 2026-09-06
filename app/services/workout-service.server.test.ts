import { beforeEach, describe, expect, it } from 'vitest';

import { Athlete } from '~/domain/athlete/athlete';
import { Equipment } from '~/domain/equipment/equipment';
import { Exercise, type ExerciseSnapshot } from '~/domain/exercise/exercise';
import { fixedClock } from '~/domain/shared/clock';
import { sequentialIds } from '~/domain/shared/ids';
import { sequentialSecrets } from '~/domain/shared/secrets';
import { Workout, type WorkoutSnapshot } from '~/domain/workout/workout';
import { InMemoryEquipmentRepository } from '~/repositories/in-memory/equipment-repository.server';
import { InMemoryExercisesRepository } from '~/repositories/in-memory/exercises-repository.server';
import { InMemoryWorkoutsRepository } from '~/repositories/in-memory/workouts-repository.server';
import { InMemoryUnitOfWork } from '~/repositories/in-memory/unit-of-work.server';

import { WorkoutService } from './workout-service.server';

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
  timezone: 'UTC',
  isAdmin: false,
  createdAt: NOW,
  updatedAt: NOW,
});

function sampleWorkout(overrides: Partial<WorkoutSnapshot> = {}): Workout {
  return Workout.fromSnapshot({
    id: 'sample-1',
    userId: null,
    forkedFromId: null,
    name: 'Push Day',
    createdAt: NOW,
    updatedAt: NOW,
    exercises: [
      {
        id: 'entry-0',
        exerciseId: 'exercise-1',
        position: 0,
        targetSets: 3,
        targetReps: 10,
        targetWeight: null,
        targetDurationSeconds: null,
        targetSpeed: null,
        targetResistance: null,
      },
    ],
    ...overrides,
  });
}

function exercise(overrides: Partial<ExerciseSnapshot> = {}): Exercise {
  return Exercise.fromSnapshot({
    id: 'exercise-1',
    userId: null,
    forkedFromId: null,
    name: 'Bench Press',
    exerciseType: 'strength',
    muscleGroup: 'chest',
    description: null,
    createdAt: NOW,
    equipmentIds: [],
    ...overrides,
  });
}

let workouts: InMemoryWorkoutsRepository;
let exercises: InMemoryExercisesRepository;
let equipment: InMemoryEquipmentRepository;
let service: WorkoutService;

beforeEach(() => {
  workouts = new InMemoryWorkoutsRepository();
  exercises = new InMemoryExercisesRepository();
  equipment = new InMemoryEquipmentRepository();
  service = new WorkoutService(workouts, exercises, equipment, new InMemoryUnitOfWork(), {
    ids: sequentialIds('new'),
    clock: fixedClock(NOW),
    secrets: sequentialSecrets('token'),
  });
});

describe('create', () => {
  it('creates an empty workout owned by the athlete', async () => {
    const summary = await service.create(athlete, 'Leg Day');

    expect(summary.name).toBe('Leg Day');
    expect(summary.isSample).toBe(false);
    expect(summary.exerciseCount).toBe(0);
  });
});

describe('detail', () => {
  it('resolves exercise names and formats each target in the athlete units', async () => {
    await workouts.save(sampleWorkout());
    await exercises.save(exercise());

    const detail = await service.detail(athlete, 'sample-1');

    expect(detail?.exercises).toEqual([
      {
        id: 'entry-0',
        position: 0,
        exerciseId: 'exercise-1',
        exerciseName: 'Bench Press',
        exerciseType: 'strength',
        targetSummary: '3 x 10',
        target: {
          sets: 3,
          reps: 10,
          weight: null,
          weightValue: null,
          duration: null,
          durationMinutesValue: null,
          speed: null,
          speedValue: null,
          resistance: null,
        },
      },
    ]);
  });

  it('reports no target chips for an untargeted entry', async () => {
    await workouts.save(
      sampleWorkout({
        exercises: [
          {
            id: 'entry-0',
            exerciseId: 'exercise-1',
            position: 0,
            targetSets: null,
            targetReps: null,
            targetWeight: null,
            targetDurationSeconds: null,
            targetSpeed: null,
            targetResistance: null,
          },
        ],
      }),
    );
    await exercises.save(exercise());

    const detail = await service.detail(athlete, 'sample-1');

    expect(detail?.exercises[0].target).toBeNull();
    expect(detail?.exercises[0].targetSummary).toBeNull();
  });

  it('falls back to "Unknown" for an entry whose exercise cannot be resolved', async () => {
    await workouts.save(sampleWorkout());
    // Exercise deliberately not saved.

    const detail = await service.detail(athlete, 'sample-1');

    expect(detail?.exercises[0].exerciseName).toBe('Unknown');
    expect(detail?.exercises[0].exerciseType).toBe('strength');
  });

  it('returns null for a workout that is not visible', async () => {
    expect(await service.detail(athlete, 'nope')).toBeNull();
  });
});

describe('addExercise on a sample', () => {
  beforeEach(async () => {
    await workouts.save(sampleWorkout({ exercises: [] }));
    await exercises.save(exercise());
  });

  it('forks the sample and converts the target into canonical units', async () => {
    const outcome = await service.addExercise(athlete, 'sample-1', 'exercise-1', {
      sets: 3,
      reps: 10,
      weight: 135,
    });

    expect(outcome.ok).toBe(true);
    const forkedId = outcome.ok ? outcome.value.forkedId : null;
    const fork = await workouts.findVisible(athlete.id, forkedId!);
    expect(fork?.exercises[0].target.weight?.inPounds).toBe(135);
  });

  it("reports the exercise as not found when it doesn't exist or isn't visible", async () => {
    const outcome = await service.addExercise(athlete, 'sample-1', 'nope', {});
    expect(outcome).toEqual({ ok: false, error: 'exercise-not-found' });
  });

  it('reports the workout as not found when it is not visible', async () => {
    const outcome = await service.addExercise(athlete, 'nope', 'exercise-1', {});
    expect(outcome).toEqual({ ok: false, error: 'not-found' });
  });
});

describe('updateExerciseTarget', () => {
  beforeEach(async () => {
    await workouts.save(
      sampleWorkout({
        exercises: [
          {
            id: 'sample-entry-0',
            exerciseId: 'exercise-1',
            position: 0,
            targetSets: null,
            targetReps: null,
            targetWeight: null,
            targetDurationSeconds: null,
            targetSpeed: null,
            targetResistance: null,
          },
        ],
      }),
    );
    await exercises.save(exercise());
  });

  it('forks the sample and replaces the target, translating the entry id', async () => {
    const outcome = await service.updateExerciseTarget(athlete, 'sample-1', 'sample-entry-0', {
      sets: 4,
      reps: 6,
      weight: 185,
    });

    expect(outcome.ok).toBe(true);
    const forkedId = outcome.ok ? outcome.value.forkedId : null;
    const fork = await workouts.findVisible(athlete.id, forkedId!);
    expect(fork?.exercises[0].target.sets).toBe(4);
    expect(fork?.exercises[0].target.reps).toBe(6);
    expect(fork?.exercises[0].target.weight?.inPounds).toBe(185);
  });

  it('drops a cardio field the exercise’s equipment cannot report', async () => {
    await exercises.save(exercise({ equipmentIds: ['rower'] }));
    await equipment.save(
      Equipment.fromSnapshot({ id: 'rower', userId: null, name: 'Rower', cardioKind: 'resistance', createdAt: NOW }),
    );

    const outcome = await service.updateExerciseTarget(athlete, 'sample-1', 'sample-entry-0', {
      durationMinutes: 20,
      speed: 8,
      resistance: 5,
    });

    expect(outcome.ok).toBe(true);
    const forkedId = outcome.ok ? outcome.value.forkedId : null;
    const fork = await workouts.findVisible(athlete.id, forkedId!);
    expect(fork?.exercises[0].target.speed).toBeNull();
    expect(fork?.exercises[0].target.resistance).toBe(5);
  });

  it('is a no-op for a stale entry id', async () => {
    const outcome = await service.updateExerciseTarget(athlete, 'sample-1', 'nope', { sets: 4 });
    expect(outcome.ok).toBe(true);
  });

  it('reports the workout as not found when it is not visible', async () => {
    const outcome = await service.updateExerciseTarget(athlete, 'nope', 'sample-entry-0', {});
    expect(outcome).toEqual({ ok: false, error: 'not-found' });
  });
});

describe('removeExercise and moveExercise translate the entry id onto the fork', () => {
  beforeEach(async () => {
    await workouts.save(
      sampleWorkout({
        exercises: [
          {
            id: 'sample-entry-0',
            exerciseId: 'exercise-1',
            position: 0,
            targetSets: null,
            targetReps: null,
            targetWeight: null,
            targetDurationSeconds: null,
            targetSpeed: null,
            targetResistance: null,
          },
          {
            id: 'sample-entry-1',
            exerciseId: 'exercise-2',
            position: 1,
            targetSets: null,
            targetReps: null,
            targetWeight: null,
            targetDurationSeconds: null,
            targetSpeed: null,
            targetResistance: null,
          },
        ],
      }),
    );
  });

  it('removes the entry the form named, on the fork', async () => {
    const outcome = await service.removeExercise(athlete, 'sample-1', 'sample-entry-0');

    expect(outcome.ok).toBe(true);
    const forkedId = outcome.ok ? outcome.value.forkedId : null;
    const fork = await workouts.findVisible(athlete.id, forkedId!);
    expect(fork?.exercises.map((entry) => entry.exerciseId)).toEqual(['exercise-2']);
  });

  it('moves the entry the form named, on the fork', async () => {
    const outcome = await service.moveExercise(athlete, 'sample-1', 'sample-entry-0', 'down');

    expect(outcome.ok).toBe(true);
    const forkedId = outcome.ok ? outcome.value.forkedId : null;
    const fork = await workouts.findVisible(athlete.id, forkedId!);
    expect(fork?.exercises.map((entry) => entry.exerciseId)).toEqual(['exercise-2', 'exercise-1']);
  });
});

describe('remove', () => {
  it('deletes an owned, deletable workout', async () => {
    await workouts.save(sampleWorkout({ id: 'own-1', userId: 'user-1' }));

    const outcome = await service.remove(athlete, 'own-1');

    expect(outcome).toEqual({ ok: true, value: undefined });
    expect(await workouts.findVisible(athlete.id, 'own-1')).toBeNull();
  });

  it('refuses to delete a shared sample', async () => {
    await workouts.save(sampleWorkout());

    expect(await service.remove(athlete, 'sample-1')).toEqual({
      ok: false,
      error: 'sample',
    });
  });

  it("reports a workout that isn't visible as not found", async () => {
    expect(await service.remove(athlete, 'nope')).toEqual({ ok: false, error: 'not-found' });
  });
});

describe('revert', () => {
  it('deletes the fork and names the original', async () => {
    await workouts.save(sampleWorkout());
    const renamed = await service.rename(athlete, 'sample-1', 'Mine');
    const forkedId = renamed.ok ? renamed.value.forkedId : null;

    const outcome = await service.revert(athlete, forkedId!);

    expect(outcome).toEqual({ ok: true, value: { forkedFromId: 'sample-1' } });
    expect(await workouts.findVisible(athlete.id, forkedId!)).toBeNull();
  });

  it('refuses to revert a workout that was never forked', async () => {
    await workouts.save(sampleWorkout({ id: 'own-1', userId: 'user-1' }));

    expect(await service.revert(athlete, 'own-1')).toEqual({
      ok: false,
      error: 'nothing-to-revert',
    });
  });
});

describe('duplicate', () => {
  it('copies a sample into a plain, unforked personal workout named "<name> (copy)"', async () => {
    await workouts.save(sampleWorkout());

    const outcome = await service.duplicate(athlete, 'sample-1');

    expect(outcome.ok).toBe(true);
    const copyId = outcome.ok ? outcome.value.id : null;
    const copy = await workouts.findVisible(athlete.id, copyId!);
    expect(copy?.name).toBe('Push Day (copy)');
    expect(copy?.ownership.isSample).toBe(false);
    expect(copy?.forkedFromId).toBeNull();
    expect(copy?.exercises.map((entry) => entry.exerciseId)).toEqual(['exercise-1']);

    // The sample is untouched and still shows in the athlete's list.
    const sample = await workouts.findVisible(athlete.id, 'sample-1');
    expect(sample).not.toBeNull();
  });

  it('numbers a second duplicate past the first', async () => {
    await workouts.save(sampleWorkout({ id: 'own-1', userId: 'user-1', name: 'Push Day' }));
    await service.duplicate(athlete, 'own-1');

    const second = await service.duplicate(athlete, 'own-1');

    const copyId = second.ok ? second.value.id : null;
    const copy = await workouts.findVisible(athlete.id, copyId!);
    expect(copy?.name).toBe('Push Day (copy 2)');
  });

  it("reports a workout that isn't visible as not found", async () => {
    expect(await service.duplicate(athlete, 'nope')).toEqual({ ok: false, error: 'not-found' });
  });
});

describe('list and listForPicker', () => {
  it('sorts the picker list by name, unlike the plain list', async () => {
    await workouts.save(sampleWorkout({ id: 'z', userId: 'user-1', name: 'Zeta', updatedAt: NOW }));
    await workouts.save(
      sampleWorkout({ id: 'a', userId: 'user-1', name: 'Alpha', updatedAt: new Date('2026-09-01T00:00:00Z') }),
    );

    const picker = await service.listForPicker(athlete);

    expect(picker.map((t) => t.name)).toEqual(['Alpha', 'Zeta']);
  });
});
