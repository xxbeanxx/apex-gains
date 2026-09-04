import { beforeEach, describe, expect, it } from 'vitest';

import { Athlete } from '~/domain/athlete/athlete';
import { Exercise, type ExerciseSnapshot } from '~/domain/exercise/exercise';
import { fixedClock } from '~/domain/shared/clock';
import { sequentialIds } from '~/domain/shared/ids';
import { WorkoutTemplate, type TemplateSnapshot } from '~/domain/template/workout-template';
import { InMemoryExercisesRepository } from '~/repositories/in-memory/exercises-repository.server';
import { InMemoryTemplatesRepository } from '~/repositories/in-memory/templates-repository.server';
import { InMemoryUnitOfWork } from '~/repositories/in-memory/unit-of-work.server';

import { TemplateService } from './template-service.server';

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
  createdAt: NOW,
  updatedAt: NOW,
});

function sampleTemplate(overrides: Partial<TemplateSnapshot> = {}): WorkoutTemplate {
  return WorkoutTemplate.fromSnapshot({
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

let templates: InMemoryTemplatesRepository;
let exercises: InMemoryExercisesRepository;
let service: TemplateService;

beforeEach(() => {
  templates = new InMemoryTemplatesRepository();
  exercises = new InMemoryExercisesRepository();
  service = new TemplateService(templates, exercises, new InMemoryUnitOfWork(), {
    ids: sequentialIds('new'),
    clock: fixedClock(NOW),
  });
});

describe('create', () => {
  it('creates an empty template owned by the athlete', async () => {
    const summary = await service.create(athlete, 'Leg Day');

    expect(summary.name).toBe('Leg Day');
    expect(summary.isSample).toBe(false);
    expect(summary.exerciseCount).toBe(0);
  });
});

describe('detail', () => {
  it('resolves exercise names and formats each target in the athlete units', async () => {
    await templates.save(sampleTemplate());
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
      },
    ]);
  });

  it('falls back to "Unknown" for an entry whose exercise cannot be resolved', async () => {
    await templates.save(sampleTemplate());
    // Exercise deliberately not saved.

    const detail = await service.detail(athlete, 'sample-1');

    expect(detail?.exercises[0].exerciseName).toBe('Unknown');
    expect(detail?.exercises[0].exerciseType).toBe('strength');
  });

  it('returns null for a template that is not visible', async () => {
    expect(await service.detail(athlete, 'nope')).toBeNull();
  });
});

describe('addExercise on a sample', () => {
  beforeEach(async () => {
    await templates.save(sampleTemplate({ exercises: [] }));
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
    const fork = await templates.findVisible(athlete.id, forkedId!);
    expect(fork?.exercises[0].target.weight?.inPounds).toBe(135);
  });

  it("reports the exercise as not found when it doesn't exist or isn't visible", async () => {
    const outcome = await service.addExercise(athlete, 'sample-1', 'nope', {});
    expect(outcome).toEqual({ ok: false, error: 'exercise-not-found' });
  });

  it('reports the template as not found when it is not visible', async () => {
    const outcome = await service.addExercise(athlete, 'nope', 'exercise-1', {});
    expect(outcome).toEqual({ ok: false, error: 'not-found' });
  });
});

describe('removeExercise and moveExercise translate the entry id onto the fork', () => {
  beforeEach(async () => {
    await templates.save(
      sampleTemplate({
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
    const fork = await templates.findVisible(athlete.id, forkedId!);
    expect(fork?.exercises.map((entry) => entry.exerciseId)).toEqual(['exercise-2']);
  });

  it('moves the entry the form named, on the fork', async () => {
    const outcome = await service.moveExercise(athlete, 'sample-1', 'sample-entry-0', 'down');

    expect(outcome.ok).toBe(true);
    const forkedId = outcome.ok ? outcome.value.forkedId : null;
    const fork = await templates.findVisible(athlete.id, forkedId!);
    expect(fork?.exercises.map((entry) => entry.exerciseId)).toEqual(['exercise-2', 'exercise-1']);
  });
});

describe('remove', () => {
  it('deletes an owned, deletable template', async () => {
    await templates.save(sampleTemplate({ id: 'own-1', userId: 'user-1' }));

    const outcome = await service.remove(athlete, 'own-1');

    expect(outcome).toEqual({ ok: true, value: undefined });
    expect(await templates.findVisible(athlete.id, 'own-1')).toBeNull();
  });

  it('refuses to delete a shared sample', async () => {
    await templates.save(sampleTemplate());

    expect(await service.remove(athlete, 'sample-1')).toEqual({
      ok: false,
      error: 'sample-template',
    });
  });

  it("reports a template that isn't visible as not found", async () => {
    expect(await service.remove(athlete, 'nope')).toEqual({ ok: false, error: 'not-found' });
  });
});

describe('revert', () => {
  it('deletes the fork and names the original', async () => {
    await templates.save(sampleTemplate());
    const renamed = await service.rename(athlete, 'sample-1', 'Mine');
    const forkedId = renamed.ok ? renamed.value.forkedId : null;

    const outcome = await service.revert(athlete, forkedId!);

    expect(outcome).toEqual({ ok: true, value: { forkedFromId: 'sample-1' } });
    expect(await templates.findVisible(athlete.id, forkedId!)).toBeNull();
  });

  it('refuses to revert a template that was never forked', async () => {
    await templates.save(sampleTemplate({ id: 'own-1', userId: 'user-1' }));

    expect(await service.revert(athlete, 'own-1')).toEqual({
      ok: false,
      error: 'nothing-to-revert',
    });
  });
});

describe('list and listForPicker', () => {
  it('sorts the picker list by name, unlike the plain list', async () => {
    await templates.save(sampleTemplate({ id: 'z', userId: 'user-1', name: 'Zeta', updatedAt: NOW }));
    await templates.save(
      sampleTemplate({ id: 'a', userId: 'user-1', name: 'Alpha', updatedAt: new Date('2026-09-01T00:00:00Z') }),
    );

    const picker = await service.listForPicker(athlete);

    expect(picker.map((t) => t.name)).toEqual(['Alpha', 'Zeta']);
  });
});
