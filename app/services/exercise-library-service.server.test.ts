import { beforeEach, describe, expect, it } from 'vitest';

import { Athlete } from '~/domain/athlete/athlete';
import { Equipment, type EquipmentSnapshot } from '~/domain/equipment/equipment';
import { Exercise, type ExerciseSnapshot } from '~/domain/exercise/exercise';
import { fixedClock } from '~/domain/shared/clock';
import { sequentialIds } from '~/domain/shared/ids';
import { InMemoryEquipmentRepository } from '~/repositories/in-memory/equipment-repository.server';
import { InMemoryExercisesRepository } from '~/repositories/in-memory/exercises-repository.server';
import { InMemoryUnitOfWork } from '~/repositories/in-memory/unit-of-work.server';

import { ExerciseLibraryService } from './exercise-library-service.server';

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

function sampleExercise(overrides: Partial<ExerciseSnapshot> = {}): Exercise {
  return Exercise.fromSnapshot({
    id: 'sample-1',
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

function sampleEquipment(overrides: Partial<EquipmentSnapshot> = {}): Equipment {
  return Equipment.fromSnapshot({
    id: 'equip-1',
    userId: null,
    name: 'Barbell',
    cardioKind: null,
    createdAt: NOW,
    ...overrides,
  });
}

let exercises: InMemoryExercisesRepository;
let equipment: InMemoryEquipmentRepository;
let service: ExerciseLibraryService;

beforeEach(() => {
  exercises = new InMemoryExercisesRepository();
  equipment = new InMemoryEquipmentRepository();
  service = new ExerciseLibraryService(exercises, equipment, new InMemoryUnitOfWork(), {
    ids: sequentialIds('new'),
    clock: fixedClock(NOW),
  });
});

describe('createExercise', () => {
  it('creates the exercise when the name is free', async () => {
    const outcome = await service.createExercise(athlete, {
      name: 'Squat',
      exerciseType: 'strength',
      muscleGroup: 'legs',
      description: null,
    });

    expect(outcome.ok).toBe(true);
    const created = await exercises.findVisible(athlete.id, outcome.ok ? outcome.value.id : '');
    expect(created?.name).toBe('Squat');
  });

  it('refuses a name that clashes with one the athlete already owns', async () => {
    await exercises.save(sampleExercise({ id: 'own-1', userId: 'user-1' }));

    const outcome = await service.createExercise(athlete, {
      name: 'Bench Press',
      exerciseType: 'strength',
      muscleGroup: null,
      description: null,
    });

    expect(outcome).toEqual({ ok: false, error: 'duplicate-name' });
  });
});

describe('updateExercise on a sample', () => {
  beforeEach(async () => {
    await exercises.save(sampleExercise());
  });

  it('forks the sample and applies the edit to the copy', async () => {
    const outcome = await service.updateExercise(athlete, 'sample-1', {
      name: 'Bench Press (Barbell)',
      exerciseType: 'strength',
      muscleGroup: 'chest',
      description: 'Flat barbell bench press',
    });

    expect(outcome.ok).toBe(true);
    const forkedId = outcome.ok ? outcome.value.forkedId : null;
    expect(forkedId).not.toBeNull();

    const fork = await exercises.findVisible(athlete.id, forkedId!);
    expect(fork?.name).toBe('Bench Press (Barbell)');
    expect(fork?.forkedFromId).toBe('sample-1');
  });

  it('leaves the shared sample untouched', async () => {
    await service.updateExercise(athlete, 'sample-1', {
      name: 'Renamed',
      exerciseType: 'strength',
      muscleGroup: null,
      description: null,
    });

    const sample = await exercises.findVisible(athlete.id, 'sample-1');
    expect(sample?.name).toBe('Bench Press');
  });

  it('reuses the existing fork on a second edit rather than minting another', async () => {
    const first = await service.updateExercise(athlete, 'sample-1', {
      name: 'First edit',
      exerciseType: 'strength',
      muscleGroup: null,
      description: null,
    });
    const second = await service.updateExercise(athlete, 'sample-1', {
      name: 'Second edit',
      exerciseType: 'strength',
      muscleGroup: null,
      description: null,
    });

    const firstId = first.ok ? first.value.forkedId : null;
    const secondId = second.ok ? second.value.forkedId : null;
    expect(secondId).toBe(firstId);
  });

  it('does not treat renaming a fork back to its own current name as a clash', async () => {
    const first = await service.updateExercise(athlete, 'sample-1', {
      name: 'My Bench',
      exerciseType: 'strength',
      muscleGroup: null,
      description: null,
    });
    const forkedId = first.ok ? first.value.forkedId : null;

    const second = await service.updateExercise(athlete, forkedId!, {
      name: 'My Bench',
      exerciseType: 'strength',
      muscleGroup: 'chest',
      description: null,
    });

    expect(second.ok).toBe(true);
  });

  it('reports a nonexistent exercise as not found', async () => {
    const outcome = await service.updateExercise(athlete, 'nope', {
      name: 'Whatever',
      exerciseType: 'strength',
      muscleGroup: null,
      description: null,
    });
    expect(outcome).toEqual({ ok: false, error: 'not-found' });
  });
});

describe('setExerciseEquipment', () => {
  it('links equipment on an owned exercise in place', async () => {
    await exercises.save(sampleExercise({ id: 'own-1', userId: 'user-1' }));

    const outcome = await service.setExerciseEquipment(athlete, 'own-1', 'equip-1', true);

    expect(outcome).toEqual({ ok: true, value: { forkedId: null } });
    const updated = await exercises.findVisible(athlete.id, 'own-1');
    expect(updated?.usesEquipment('equip-1')).toBe(true);
  });

  it('forks a sample before linking equipment on it', async () => {
    await exercises.save(sampleExercise());

    const outcome = await service.setExerciseEquipment(athlete, 'sample-1', 'equip-1', true);

    const forkedId = outcome.ok ? outcome.value.forkedId : null;
    expect(forkedId).not.toBeNull();
    const fork = await exercises.findVisible(athlete.id, forkedId!);
    expect(fork?.usesEquipment('equip-1')).toBe(true);
  });
});

describe('revertExercise', () => {
  it('deletes the fork and falls back to the shared sample', async () => {
    await exercises.save(sampleExercise());
    const renamed = await service.updateExercise(athlete, 'sample-1', {
      name: 'Mine',
      exerciseType: 'strength',
      muscleGroup: null,
      description: null,
    });
    const forkedId = renamed.ok ? renamed.value.forkedId : null;

    const outcome = await service.revertExercise(athlete, forkedId!);

    expect(outcome).toEqual({ ok: true, value: undefined });
    expect(await exercises.findVisible(athlete.id, forkedId!)).toBeNull();
  });

  it('refuses to revert an exercise that was never forked', async () => {
    await exercises.save(sampleExercise({ id: 'own-1', userId: 'user-1' }));

    const outcome = await service.revertExercise(athlete, 'own-1');

    expect(outcome).toEqual({ ok: false, error: 'nothing-to-revert' });
  });

  it('refuses to revert a sample itself', async () => {
    await exercises.save(sampleExercise());

    const outcome = await service.revertExercise(athlete, 'sample-1');

    expect(outcome).toEqual({ ok: false, error: 'nothing-to-revert' });
  });
});

describe('equipment management', () => {
  it('adds new equipment', async () => {
    await service.addEquipment(athlete, 'Treadmill', 'speed');

    const found = await equipment.findByName('Treadmill');
    expect(found?.cardioKind).toBe('speed');
  });

  it('is a no-op when the equipment name already exists', async () => {
    await equipment.save(sampleEquipment({ name: 'Barbell' }));

    await service.addEquipment(athlete, 'Barbell', null);

    const all = await equipment.listFor(athlete.id, true);
    expect(all.filter((item) => item.name === 'Barbell')).toHaveLength(1);
  });

  it('removes equipment the athlete owns', async () => {
    await equipment.save(sampleEquipment({ id: 'own-equip', userId: 'user-1' }));

    await service.removeEquipment(athlete, 'own-equip');

    expect(await equipment.findById('own-equip')).toBeNull();
  });

  it('silently ignores removing a shared sample', async () => {
    await equipment.save(sampleEquipment());

    await service.removeEquipment(athlete, 'equip-1');

    expect(await equipment.findById('equip-1')).not.toBeNull();
  });

  it('sets the cardio kind on equipment the athlete owns', async () => {
    await equipment.save(sampleEquipment({ id: 'own-equip', userId: 'user-1', cardioKind: null }));

    await service.setEquipmentCardioKind(athlete, 'own-equip', 'resistance');

    expect((await equipment.findById('own-equip'))?.cardioKind).toBe('resistance');
  });
});

describe('library', () => {
  it('resolves each exercise equipment id to a name, keyed independent of visibility', async () => {
    await equipment.save(sampleEquipment({ id: 'equip-1', name: 'Barbell' }));
    await exercises.save(sampleExercise({ id: 'own-1', userId: 'user-1', name: 'Bench', equipmentIds: ['equip-1'] }));

    const view = await service.listExercises(athlete);

    expect(view).toHaveLength(1);
    expect(view[0].equipment).toEqual([{ id: 'equip-1', name: 'Barbell', isSample: true, cardioKind: null }]);
  });
});
