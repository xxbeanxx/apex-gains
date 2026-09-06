import { beforeEach, describe, expect, it } from 'vitest';

import { Athlete } from '~/domain/athlete/athlete';
import { BodyWeightEntry } from '~/domain/bodyweight/body-weight-entry';
import { Exercise } from '~/domain/exercise/exercise';
import { Plan } from '~/domain/plan/plan';
import { fixedClock } from '~/domain/shared/clock';
import { sequentialIds } from '~/domain/shared/ids';
import { sequentialSecrets } from '~/domain/shared/secrets';
import { Session } from '~/domain/session/session';
import { SetTarget } from '~/domain/workout/set-target';
import { Workout } from '~/domain/workout/workout';
import { DateOnly } from '~/domain/values/date-only';
import { Duration } from '~/domain/values/duration';
import { Rpe } from '~/domain/values/rpe';
import { Weight } from '~/domain/values/weight';
import { InMemoryBodyWeightRepository } from '~/repositories/in-memory/body-weight-repository.server';
import { InMemoryExercisesRepository } from '~/repositories/in-memory/exercises-repository.server';
import { InMemoryPlansRepository } from '~/repositories/in-memory/plans-repository.server';
import { InMemorySessionsRepository } from '~/repositories/in-memory/sessions-repository.server';
import { InMemoryWorkoutsRepository } from '~/repositories/in-memory/workouts-repository.server';

import { ExportService } from './export-service.server';

const NOW = new Date('2026-09-04T12:00:00Z');
const deps = { ids: sequentialIds('id'), clock: fixedClock(NOW), secrets: sequentialSecrets('token') };

const athlete = Athlete.fromSnapshot({
  id: 'user-1',
  googleSub: 'google-1',
  email: 'athlete@example.com',
  name: 'Athlete',
  avatarUrl: null,
  weightUnit: 'kg',
  distanceUnit: 'mi',
  showSampleData: true,
  timezone: 'UTC',
  defaultRestSeconds: null,
  isAdmin: false,
  createdAt: NOW,
  updatedAt: NOW,
});

let exercises: InMemoryExercisesRepository;
let workouts: InMemoryWorkoutsRepository;
let plans: InMemoryPlansRepository;
let sessions: InMemorySessionsRepository;
let bodyWeight: InMemoryBodyWeightRepository;
let service: ExportService;

beforeEach(() => {
  exercises = new InMemoryExercisesRepository();
  workouts = new InMemoryWorkoutsRepository();
  plans = new InMemoryPlansRepository();
  sessions = new InMemorySessionsRepository();
  bodyWeight = new InMemoryBodyWeightRepository();
  service = new ExportService(exercises, workouts, plans, sessions, bodyWeight);
});

async function seedTraining(): Promise<{ exercise: Exercise }> {
  const exercise = Exercise.create(
    'user-1',
    { name: 'Bench Press', exerciseType: 'strength', muscleGroup: 'chest', description: null },
    deps,
  );
  await exercises.save(exercise);

  const workout = Workout.create('user-1', 'Push Day', deps);
  workout.addExercise(
    exercise.id,
    SetTarget.of({ sets: 3, reps: 8, weight: Weight.lb(135), rest: Duration.seconds(90) }),
    deps,
  );
  await workouts.save(workout);

  const plan = Plan.create('user-1', 'PPL', DateOnly.parse('2026-09-01'), deps);
  plan.addSlot(workout.id, deps);
  await plans.save(plan);

  const day = Session.open(
    'user-1',
    DateOnly.parse('2026-09-03'),
    { planId: plan.id, workoutId: workout.id, isRestDay: false },
    deps,
  );
  day.logSet(exercise.id, { reps: 8, weight: Weight.lb(135), rpe: Rpe.of(8), notes: 'felt good' }, deps);
  await sessions.save(day);

  await bodyWeight.save(BodyWeightEntry.record('user-1', DateOnly.parse('2026-09-03'), Weight.lb(180), deps));

  return { exercise };
}

describe('snapshot', () => {
  it('carries the athlete, in canonical units with the display preference recorded separately', async () => {
    const snapshot = await service.snapshot(athlete);

    expect(snapshot.athlete).toEqual({
      id: 'user-1',
      name: 'Athlete',
      email: 'athlete@example.com',
      units: { weight: 'kg', distance: 'mi' },
      timezone: 'UTC',
    });
  });

  it('carries every exercise, workout, plan, session and weigh-in the athlete owns', async () => {
    const { exercise } = await seedTraining();

    const snapshot = await service.snapshot(athlete);

    expect(snapshot.exercises).toEqual([
      { id: exercise.id, name: 'Bench Press', exerciseType: 'strength', muscleGroup: 'chest', description: null },
    ]);
    expect(snapshot.workouts).toHaveLength(1);
    expect(snapshot.workouts[0]!.exercises).toEqual([
      {
        exerciseId: exercise.id,
        position: 0,
        sets: 3,
        reps: 8,
        weightLb: 135,
        durationSeconds: null,
        speedKmh: null,
        resistance: null,
        restSeconds: 90,
      },
    ]);
    expect(snapshot.plans).toHaveLength(1);
    expect(snapshot.plans[0]!.slots).toEqual([{ position: 0, workoutId: expect.any(String), isRestDay: false }]);
    expect(snapshot.sessions).toEqual([
      {
        date: '2026-09-03',
        isRestDay: false,
        sets: [
          {
            exerciseId: exercise.id,
            setNumber: 1,
            reps: 8,
            weightLb: 135,
            durationSeconds: null,
            speedKmh: null,
            resistanceLevel: null,
            rpe: 8,
            notes: 'felt good',
          },
        ],
      },
    ]);
    expect(snapshot.bodyWeight).toEqual([{ date: '2026-09-03', weightLb: 180 }]);
  });

  it('is empty for an athlete who has logged nothing', async () => {
    const snapshot = await service.snapshot(athlete);

    expect(snapshot.exercises).toEqual([]);
    expect(snapshot.workouts).toEqual([]);
    expect(snapshot.plans).toEqual([]);
    expect(snapshot.sessions).toEqual([]);
    expect(snapshot.bodyWeight).toEqual([]);
  });

  it("never includes another athlete's rows", async () => {
    const theirs = Exercise.create(
      'user-2',
      { name: 'Squat', exerciseType: 'strength', muscleGroup: null, description: null },
      deps,
    );
    await exercises.save(theirs);

    const snapshot = await service.snapshot(athlete);

    expect(snapshot.exercises).toEqual([]);
  });
});

describe('toCsv', () => {
  it('has a header row and one row per logged set, joining in the exercise name', async () => {
    await seedTraining();

    const csv = await service.toCsv(athlete);
    const lines = csv.split('\n');

    expect(lines[0]).toBe('date,exercise_name,set_number,reps,weight_lb,duration_seconds,speed_kmh,resistance_level,rpe,notes');
    expect(lines[1]).toBe('2026-09-03,Bench Press,1,8,135,,,,8,felt good');
    expect(lines).toHaveLength(2);
  });

  it('quotes a note containing a comma', async () => {
    const exercise = Exercise.create(
      'user-1',
      { name: 'Row', exerciseType: 'strength', muscleGroup: null, description: null },
      deps,
    );
    await exercises.save(exercise);
    const day = Session.open('user-1', DateOnly.parse('2026-09-03'), { planId: null, workoutId: null, isRestDay: false }, deps);
    day.logSet(exercise.id, { reps: 10, weight: Weight.lb(100), notes: 'Rod 4 slipping, watch grip' }, deps);
    await sessions.save(day);

    const csv = await service.toCsv(athlete);

    expect(csv.split('\n')[1]).toBe('2026-09-03,Row,1,10,100,,,,,"Rod 4 slipping, watch grip"');
  });

  it('is just the header for an athlete who has logged nothing', async () => {
    const csv = await service.toCsv(athlete);

    expect(csv.split('\n')).toHaveLength(1);
  });
});
