import { beforeEach, describe, expect, it } from 'vitest';

import { Athlete } from '~/domain/athlete/athlete';
import { Equipment, type EquipmentSnapshot } from '~/domain/equipment/equipment';
import { Exercise, type ExerciseSnapshot } from '~/domain/exercise/exercise';
import { Plan, type PlanSnapshot } from '~/domain/plan/plan';
import { fixedClock } from '~/domain/shared/clock';
import { sequentialIds } from '~/domain/shared/ids';
import { sequentialSecrets } from '~/domain/shared/secrets';
import { Session } from '~/domain/session/session';
import { Workout, type WorkoutSnapshot } from '~/domain/workout/workout';
import { DateOnly } from '~/domain/values/date-only';
import { InMemoryEquipmentRepository } from '~/repositories/in-memory/equipment-repository.server';
import { InMemoryExercisesRepository } from '~/repositories/in-memory/exercises-repository.server';
import { InMemoryPlansRepository } from '~/repositories/in-memory/plans-repository.server';
import { InMemoryWorkoutsRepository } from '~/repositories/in-memory/workouts-repository.server';
import { InMemorySessionsRepository } from '~/repositories/in-memory/sessions-repository.server';

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
  timezone: 'UTC',
  isAdmin: false,
  createdAt: NOW,
  updatedAt: NOW,
});

function plan(overrides: Partial<PlanSnapshot> = {}): Plan {
  return Plan.fromSnapshot({
    id: 'plan-1',
    userId: 'user-1',
    forkedFromId: null,
    name: 'PPL',
    isActive: true,
    anchorDate: '2026-09-01',
    shareToken: null,
    createdAt: NOW,
    updatedAt: NOW,
    slots: [
      { id: 'slot-0', position: 0, workoutId: 'workout-1' },
      { id: 'slot-1', position: 1, workoutId: null },
    ],
    ...overrides,
  });
}

function workout(overrides: Partial<WorkoutSnapshot> = {}): Workout {
  return Workout.fromSnapshot({
    id: 'workout-1',
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

let plans: InMemoryPlansRepository;
let workouts: InMemoryWorkoutsRepository;
let exercises: InMemoryExercisesRepository;
let equipmentRepo: InMemoryEquipmentRepository;
let sessions: InMemorySessionsRepository;
let service: TrainingPlanService;

beforeEach(() => {
  plans = new InMemoryPlansRepository();
  workouts = new InMemoryWorkoutsRepository();
  exercises = new InMemoryExercisesRepository();
  equipmentRepo = new InMemoryEquipmentRepository();
  sessions = new InMemorySessionsRepository();
  service = new TrainingPlanService(plans, workouts, exercises, equipmentRepo, sessions);
});

describe('planFor', () => {
  it('reports "none" when the athlete has no active plan', async () => {
    expect(await service.planFor(athlete, DateOnly.parse('2026-09-01'))).toEqual({ type: 'none' });
  });

  it('reports "rest" on a rest-day slot', async () => {
    await plans.save(plan());

    const result = await service.planFor(athlete, DateOnly.parse('2026-09-02'));

    expect(result).toEqual({ type: 'rest', planId: 'plan-1' });
  });

  it('reports the workout and its exercises on a training-day slot', async () => {
    await plans.save(plan());
    await workouts.save(workout());
    await exercises.save(exercise());
    await equipmentRepo.save(equipment({ cardioKind: null }));

    const result = await service.planFor(athlete, DateOnly.parse('2026-09-01'));

    expect(result).toEqual({
      type: 'workout',
      planId: 'plan-1',
      workoutId: 'workout-1',
      workoutName: 'Push Day',
      items: [
        {
          exerciseId: 'exercise-1',
          exerciseName: 'Bench Press',
          exerciseType: 'strength',
          cardioFields: { showSpeed: true, showResistance: true },
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
      ],
    });
  });

  it('degrades a slot pointing at an invisible workout to a rest day', async () => {
    await plans.save(plan());
    // Workout deliberately not saved - simulates a deleted/hidden workout.

    const result = await service.planFor(athlete, DateOnly.parse('2026-09-01'));

    expect(result).toEqual({ type: 'rest', planId: 'plan-1' });
  });

  it('reports "none" for a plan with no slots', async () => {
    await plans.save(plan({ slots: [] }));

    expect(await service.planFor(athlete, DateOnly.parse('2026-09-01'))).toEqual({ type: 'none' });
  });
});

describe('sessionPlanFrom', () => {
  it('captures a workout day', () => {
    expect(
      TrainingPlanService.sessionPlanFrom({
        type: 'workout',
        planId: 'r',
        workoutId: 't',
        workoutName: 'Push',
        items: [],
      }),
    ).toEqual({ planId: 'r', workoutId: 't', isRestDay: false });
  });

  it('captures a rest day', () => {
    expect(TrainingPlanService.sessionPlanFrom({ type: 'rest', planId: 'r' })).toEqual({
      planId: 'r',
      workoutId: null,
      isRestDay: true,
    });
  });

  it('captures no active plan', () => {
    expect(TrainingPlanService.sessionPlanFrom({ type: 'none' })).toEqual({
      planId: null,
      workoutId: null,
      isRestDay: false,
    });
  });
});

describe('upcomingWeek', () => {
  it('reports "none" for every day when there is no active plan', async () => {
    const week = await service.upcomingWeek(athlete, DateOnly.parse('2026-09-01'));

    expect(week).toHaveLength(7);
    expect(week.every((day) => day.type === 'none')).toBe(true);
  });

  it('names the workout for a training day and marks rest days', async () => {
    await plans.save(plan());
    await workouts.save(workout());

    const week = await service.upcomingWeek(athlete, DateOnly.parse('2026-09-01'));

    expect(week[0]).toEqual({ date: '2026-09-01', type: 'workout', workoutName: 'Push Day' });
    expect(week[1]).toEqual({ date: '2026-09-02', type: 'rest' });
  });
});

describe('pastWeek', () => {
  it('reports what was actually logged, and "none" for days with nothing', async () => {
    const session = Session.open(
      'user-1',
      DateOnly.parse('2026-08-30'),
      { planId: 'plan-1', workoutId: 'workout-1', isRestDay: false },
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
