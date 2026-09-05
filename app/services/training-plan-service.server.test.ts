import { beforeEach, describe, expect, it } from 'vitest';

import { Athlete } from '~/domain/athlete/athlete';
import { Equipment, type EquipmentSnapshot } from '~/domain/equipment/equipment';
import { Exercise, type ExerciseSnapshot } from '~/domain/exercise/exercise';
import { Routine, type RoutineSnapshot } from '~/domain/routine/routine';
import { fixedClock } from '~/domain/shared/clock';
import { sequentialIds } from '~/domain/shared/ids';
import { sequentialSecrets } from '~/domain/shared/secrets';
import { WorkoutSession } from '~/domain/session/workout-session';
import { WorkoutTemplate, type TemplateSnapshot } from '~/domain/template/workout-template';
import { DateOnly } from '~/domain/values/date-only';
import { InMemoryEquipmentRepository } from '~/repositories/in-memory/equipment-repository.server';
import { InMemoryExercisesRepository } from '~/repositories/in-memory/exercises-repository.server';
import { InMemoryRoutinesRepository } from '~/repositories/in-memory/routines-repository.server';
import { InMemoryTemplatesRepository } from '~/repositories/in-memory/templates-repository.server';
import { InMemoryWorkoutSessionsRepository } from '~/repositories/in-memory/workout-sessions-repository.server';

import { TrainingPlanService } from './training-plan-service.server';

const NOW = new Date('2026-09-01T12:00:00Z');
const deps = { ids: sequentialIds('id'), clock: fixedClock(NOW), secrets: sequentialSecrets('token') };

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

function routine(overrides: Partial<RoutineSnapshot> = {}): Routine {
  return Routine.fromSnapshot({
    id: 'routine-1',
    userId: 'user-1',
    forkedFromId: null,
    name: 'PPL',
    isActive: true,
    anchorDate: '2026-09-01',
    shareToken: null,
    createdAt: NOW,
    updatedAt: NOW,
    slots: [
      { id: 'slot-0', position: 0, templateId: 'template-1' },
      { id: 'slot-1', position: 1, templateId: null },
    ],
    ...overrides,
  });
}

function template(overrides: Partial<TemplateSnapshot> = {}): WorkoutTemplate {
  return WorkoutTemplate.fromSnapshot({
    id: 'template-1',
    userId: 'user-1',
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
    userId: 'user-1',
    forkedFromId: null,
    name: 'Bench Press',
    exerciseType: 'strength',
    muscleGroup: 'chest',
    description: null,
    createdAt: NOW,
    equipmentIds: ['equipment-1'],
    ...overrides,
  });
}

function equipment(overrides: Partial<EquipmentSnapshot> = {}): Equipment {
  return Equipment.fromSnapshot({
    id: 'equipment-1',
    userId: 'user-1',
    name: 'Barbell',
    cardioKind: null,
    createdAt: NOW,
    ...overrides,
  });
}

let routines: InMemoryRoutinesRepository;
let templates: InMemoryTemplatesRepository;
let exercises: InMemoryExercisesRepository;
let equipmentRepo: InMemoryEquipmentRepository;
let sessions: InMemoryWorkoutSessionsRepository;
let service: TrainingPlanService;

beforeEach(() => {
  routines = new InMemoryRoutinesRepository();
  templates = new InMemoryTemplatesRepository();
  exercises = new InMemoryExercisesRepository();
  equipmentRepo = new InMemoryEquipmentRepository();
  sessions = new InMemoryWorkoutSessionsRepository();
  service = new TrainingPlanService(routines, templates, exercises, equipmentRepo, sessions);
});

describe('planFor', () => {
  it('reports "none" when the athlete has no active routine', async () => {
    expect(await service.planFor(athlete, DateOnly.parse('2026-09-01'))).toEqual({ type: 'none' });
  });

  it('reports "rest" on a rest-day slot', async () => {
    await routines.save(routine());

    const plan = await service.planFor(athlete, DateOnly.parse('2026-09-02'));

    expect(plan).toEqual({ type: 'rest', routineId: 'routine-1' });
  });

  it('reports the template and its exercises on a training-day slot', async () => {
    await routines.save(routine());
    await templates.save(template());
    await exercises.save(exercise());
    await equipmentRepo.save(equipment({ cardioKind: null }));

    const plan = await service.planFor(athlete, DateOnly.parse('2026-09-01'));

    expect(plan).toEqual({
      type: 'template',
      routineId: 'routine-1',
      templateId: 'template-1',
      templateName: 'Push Day',
      items: [
        {
          exerciseId: 'exercise-1',
          exerciseName: 'Bench Press',
          exerciseType: 'strength',
          cardioFields: { showSpeed: true, showResistance: true },
          targetSummary: '3 x 10',
          targetSets: 3,
        },
      ],
    });
  });

  it('degrades a slot pointing at an invisible template to a rest day', async () => {
    await routines.save(routine());
    // Template deliberately not saved - simulates a deleted/hidden template.

    const plan = await service.planFor(athlete, DateOnly.parse('2026-09-01'));

    expect(plan).toEqual({ type: 'rest', routineId: 'routine-1' });
  });

  it('reports "none" for a routine with no slots', async () => {
    await routines.save(routine({ slots: [] }));

    expect(await service.planFor(athlete, DateOnly.parse('2026-09-01'))).toEqual({ type: 'none' });
  });
});

describe('sessionPlanFrom', () => {
  it('captures a template day', () => {
    expect(
      TrainingPlanService.sessionPlanFrom({
        type: 'template',
        routineId: 'r',
        templateId: 't',
        templateName: 'Push',
        items: [],
      }),
    ).toEqual({ routineId: 'r', templateId: 't', isRestDay: false });
  });

  it('captures a rest day', () => {
    expect(TrainingPlanService.sessionPlanFrom({ type: 'rest', routineId: 'r' })).toEqual({
      routineId: 'r',
      templateId: null,
      isRestDay: true,
    });
  });

  it('captures no active plan', () => {
    expect(TrainingPlanService.sessionPlanFrom({ type: 'none' })).toEqual({
      routineId: null,
      templateId: null,
      isRestDay: false,
    });
  });
});

describe('upcomingWeek', () => {
  it('reports "none" for every day when there is no active routine', async () => {
    const week = await service.upcomingWeek(athlete, DateOnly.parse('2026-09-01'));

    expect(week).toHaveLength(7);
    expect(week.every((day) => day.type === 'none')).toBe(true);
  });

  it('names the template for a training day and marks rest days', async () => {
    await routines.save(routine());
    await templates.save(template());

    const week = await service.upcomingWeek(athlete, DateOnly.parse('2026-09-01'));

    expect(week[0]).toEqual({ date: '2026-09-01', type: 'template', templateName: 'Push Day' });
    expect(week[1]).toEqual({ date: '2026-09-02', type: 'rest' });
  });
});

describe('pastWeek', () => {
  it('reports what was actually logged, and "none" for days with nothing', async () => {
    const session = WorkoutSession.open(
      'user-1',
      DateOnly.parse('2026-08-30'),
      { routineId: 'routine-1', templateId: 'template-1', isRestDay: false },
      deps,
    );
    session.logSet('exercise-1', { reps: 8 }, deps);
    await sessions.add(session);

    const week = await service.pastWeek(athlete, DateOnly.parse('2026-09-01'));

    const logged = week.find((day) => day.date === '2026-08-30');
    expect(logged).toEqual({ date: '2026-08-30', status: 'workout', exerciseCount: 1, setCount: 1 });

    const empty = week.find((day) => day.date === '2026-08-29');
    expect(empty).toEqual({ date: '2026-08-29', status: 'none', exerciseCount: 0, setCount: 0 });
  });
});
