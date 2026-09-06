import { beforeEach, describe, expect, it } from 'vitest';

import { Athlete, type AthleteSnapshot } from '~domain/athlete/athlete';
import { Exercise } from '~domain/exercise/exercise';
import { Plan } from '~domain/plan/plan';
import { fixedClock } from '~domain/shared/clock';
import { sequentialIds } from '~domain/shared/ids';
import { sequentialSecrets } from '~domain/shared/secrets';
import { SetTarget } from '~domain/workout/set-target';
import { Workout } from '~domain/workout/workout';
import { DateOnly } from '~domain/values/date-only';
import { InMemoryEquipmentRepository } from '~infrastructure/persistence/in-memory/equipment-repository';
import { InMemoryExercisesRepository } from '~infrastructure/persistence/in-memory/exercises-repository';
import { InMemoryPlansRepository } from '~infrastructure/persistence/in-memory/plans-repository';
import { InMemoryWorkoutsRepository } from '~infrastructure/persistence/in-memory/workouts-repository';
import { InMemoryUnitOfWork } from '~infrastructure/persistence/in-memory/unit-of-work';
import { InMemorySessionsRepository } from '~infrastructure/persistence/in-memory/sessions-repository';

import { TrainingPlanService } from '~application/use-cases/training-plan-service';
import { SessionService } from './session-service';

const NOW = new Date('2026-09-03T12:00:00Z');
const TODAY = DateOnly.parse('2026-09-03');
const deps = { ids: sequentialIds('gen'), clock: fixedClock(NOW), secrets: sequentialSecrets('token') };

function athleteWith(overrides: Partial<AthleteSnapshot> = {}): Athlete {
  return Athlete.fromSnapshot({
    id: 'user-1',
    googleSub: 'google-1',
    email: 'athlete@example.com',
    name: 'Athlete',
    avatarUrl: null,
    weightUnit: 'lb',
    distanceUnit: 'km',
    lengthUnit: 'in',
    showSampleData: true,
    defaultRestSeconds: null,
    timezone: 'UTC',
    isAdmin: false,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  });
}

let sessions: InMemorySessionsRepository;
let exercises: InMemoryExercisesRepository;
let plans: InMemoryPlansRepository;
let workouts: InMemoryWorkoutsRepository;
let service: SessionService;

beforeEach(async () => {
  sessions = new InMemorySessionsRepository();
  exercises = new InMemoryExercisesRepository();
  plans = new InMemoryPlansRepository();
  workouts = new InMemoryWorkoutsRepository();

  service = new SessionService(
    sessions,
    exercises,
    new TrainingPlanService(plans, workouts, exercises, new InMemoryEquipmentRepository(), sessions),
    new InMemoryUnitOfWork(),
    deps,
  );

  await exercises.save(
    Exercise.create(
      'user-1',
      {
        name: 'Bench Press',
        exerciseType: 'strength',
        muscleGroup: 'chest',
        description: null,
      },
      { ids: sequentialIds('bench'), clock: fixedClock(NOW) },
    ),
  );
});

async function benchId(): Promise<string> {
  const [bench] = await exercises.listFor('user-1', true);
  return bench.id;
}

describe('logging a set', () => {
  it("opens the day's session on the first set", async () => {
    const athlete = athleteWith();
    const outcome = await service.logSet(athlete, TODAY, await benchId(), {
      reps: 10,
      weight: 135,
    });

    expect(outcome).toEqual({ ok: true, value: { sessionOpened: true } });
    expect((await sessions.findForDate('user-1', TODAY))?.setCount).toBe(1);
  });

  it("reuses the day's session for later sets", async () => {
    const athlete = athleteWith();
    const bench = await benchId();

    await service.logSet(athlete, TODAY, bench, { reps: 10 });
    const second = await service.logSet(athlete, TODAY, bench, { reps: 8 });

    expect(second).toEqual({ ok: true, value: { sessionOpened: false } });
    expect((await sessions.findForDate('user-1', TODAY))?.setCount).toBe(2);
  });

  it('refuses an exercise the athlete cannot see', async () => {
    const outcome = await service.logSet(athleteWith(), TODAY, 'ghost', {
      reps: 10,
    });
    expect(outcome).toEqual({ ok: false, error: 'exercise-not-found' });
  });

  /**
   * The number on the form is in whatever unit the athlete chose; storage is
   * canonical. This is the conversion that makes the /settings preference
   * mean something.
   */
  it('stores a weight entered in kilograms as canonical pounds', async () => {
    const metric = athleteWith({ weightUnit: 'kg' });
    await service.logSet(metric, TODAY, await benchId(), {
      reps: 5,
      weight: 100,
    });

    const set = (await sessions.findForDate('user-1', TODAY))!.sets[0];
    expect(set.weight?.inPounds).toBeCloseTo(220.46, 1);
    expect(set.weight?.as('kg')).toBeCloseTo(100, 1);
  });

  it("reads the same set back in each athlete's own units", async () => {
    const metric = athleteWith({ weightUnit: 'kg' });
    await service.logSet(metric, TODAY, await benchId(), {
      reps: 5,
      weight: 100,
    });

    const inKg = await service.loggedSetsFor(metric, TODAY);
    const inLb = await service.loggedSetsFor(athleteWith(), TODAY);

    expect(inKg[0].summary).toBe('100 kg x 5');
    expect(inLb[0].summary).toBe('220.5 lb x 5');
  });

  it('records notes and an RPE, with the RPE folded into the summary', async () => {
    const athlete = athleteWith();
    await service.logSet(athlete, TODAY, await benchId(), {
      reps: 8,
      weight: 135,
      notes: 'Rod 4 slipping',
      rpe: 8.5,
    });

    const [logged] = await service.loggedSetsFor(athlete, TODAY);
    expect(logged.notes).toBe('Rod 4 slipping');
    expect(logged.summary).toBe('135 lb x 8 @ RPE 8.5');
  });

  it('refuses an RPE outside the 1-10 half-point scale', async () => {
    await expect(service.logSet(athleteWith(), TODAY, await benchId(), { reps: 8, rpe: 11 })).rejects.toThrow('Invalid RPE');
  });

  it('converts minutes to a stored duration', async () => {
    await service.logSet(athleteWith(), TODAY, await benchId(), {
      durationMinutes: 30,
    });

    const set = (await sessions.findForDate('user-1', TODAY))!.sets[0];
    expect(set.duration?.inSeconds).toBe(1800);
  });

  it('records what the day was planned as when it opens the session', async () => {
    const workout = Workout.create('user-1', 'Push', deps);
    workout.addExercise(await benchId(), SetTarget.none(), deps);
    await workouts.save(workout);

    const plan = Plan.create('user-1', 'PPL', TODAY, deps);
    plan.addSlot(workout.id, deps);
    plan.activate(NOW);
    await plans.save(plan);

    await service.logSet(athleteWith(), TODAY, await benchId(), { reps: 10 });

    const session = (await sessions.findForDate('user-1', TODAY))!;
    expect(session.plan).toEqual({
      planId: plan.id,
      workoutId: workout.id,
      isRestDay: false,
    });
  });
});

describe('recent sets for an exercise', () => {
  it('returns nothing for an exercise never logged', async () => {
    expect(await service.recentSetsFor(athleteWith(), await benchId(), 5)).toEqual([]);
  });

  it('returns newest first, across days', async () => {
    const athlete = athleteWith();
    const bench = await benchId();

    await service.logSet(athlete, TODAY.minusDays(1), bench, {
      reps: 8,
      weight: 135,
    });
    await service.logSet(athlete, TODAY, bench, { reps: 6, weight: 145 });

    const recent = await service.recentSetsFor(athlete, bench, 5);

    expect(recent).toEqual([
      { date: TODAY.value, summary: '145 lb x 6' },
      { date: TODAY.minusDays(1).value, summary: '135 lb x 8' },
    ]);
  });

  it('respects the limit', async () => {
    const athlete = athleteWith();
    const bench = await benchId();

    await service.logSet(athlete, TODAY, bench, { reps: 10, weight: 100 });
    await service.logSet(athlete, TODAY, bench, { reps: 8, weight: 110 });
    await service.logSet(athlete, TODAY, bench, { reps: 6, weight: 120 });

    expect(await service.recentSetsFor(athlete, bench, 2)).toHaveLength(2);
  });

  it("reads the set back in the requesting athlete's own units", async () => {
    const athlete = athleteWith();
    const bench = await benchId();
    await service.logSet(athlete, TODAY, bench, { reps: 5, weight: 100 });

    const metric = athleteWith({ weightUnit: 'kg' });
    const recent = await service.recentSetsFor(metric, bench, 5);

    expect(recent[0].summary).toBe('45.4 kg x 5');
  });
});

describe('last set per exercise', () => {
  it('returns nothing for an exercise never logged', async () => {
    expect(await service.lastSetsFor(athleteWith(), TODAY)).toEqual({});
  });

  it('prefills from the previous session, converted into the requesting units', async () => {
    const athlete = athleteWith();
    const bench = await benchId();
    await service.logSet(athlete, TODAY.minusDays(1), bench, { reps: 8, weight: 135 });

    const metric = athleteWith({ weightUnit: 'kg' });
    const lastSets = await service.lastSetsFor(metric, TODAY);

    expect(lastSets[bench]).toMatchObject({
      date: TODAY.minusDays(1).value,
      reps: 8,
      summary: '61.2 kg x 8',
    });
    expect(lastSets[bench]!.weight).toBeCloseTo(61.2, 1);
  });

  it('excludes a set logged on the date being viewed', async () => {
    const athlete = athleteWith();
    const bench = await benchId();
    await service.logSet(athlete, TODAY, bench, { reps: 8, weight: 135 });

    expect(await service.lastSetsFor(athlete, TODAY)).toEqual({});
  });
});

describe('removing a set', () => {
  it('takes the set back off the day', async () => {
    const athlete = athleteWith();
    const bench = await benchId();
    await service.logSet(athlete, TODAY, bench, { reps: 10 });

    const [logged] = await service.loggedSetsFor(athlete, TODAY);
    expect(await service.removeSet(athlete, TODAY, logged.id)).toEqual({
      ok: true,
      value: undefined,
    });
    expect(await service.loggedSetsFor(athlete, TODAY)).toEqual([]);
  });

  it("reports a set that isn't on that day as not found", async () => {
    const athlete = athleteWith();
    await service.logSet(athlete, TODAY, await benchId(), { reps: 10 });

    expect(await service.removeSet(athlete, TODAY, 'nope')).toEqual({
      ok: false,
      error: 'not-found',
    });
  });

  it('reports a day with no session as not found', async () => {
    expect(await service.removeSet(athleteWith(), TODAY, 'whatever')).toEqual({ ok: false, error: 'not-found' });
  });
});
