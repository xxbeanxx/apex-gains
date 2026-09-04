import { beforeEach, describe, expect, it } from 'vitest';

import { Athlete, type AthleteSnapshot } from '~/domain/athlete/athlete';
import { Exercise } from '~/domain/exercise/exercise';
import { Routine } from '~/domain/routine/routine';
import { fixedClock } from '~/domain/shared/clock';
import { sequentialIds } from '~/domain/shared/ids';
import { SetTarget } from '~/domain/template/set-target';
import { WorkoutTemplate } from '~/domain/template/workout-template';
import { DateOnly } from '~/domain/values/date-only';
import { InMemoryExercisesRepository } from '~/repositories/in-memory/exercises-repository.server';
import { InMemoryRoutinesRepository } from '~/repositories/in-memory/routines-repository.server';
import { InMemoryTemplatesRepository } from '~/repositories/in-memory/templates-repository.server';
import { InMemoryUnitOfWork } from '~/repositories/in-memory/unit-of-work.server';
import { InMemoryWorkoutSessionsRepository } from '~/repositories/in-memory/workout-sessions-repository.server';

import { TrainingPlanService } from './training-plan-service.server';
import { WorkoutLogService } from './workout-log-service.server';

const NOW = new Date('2026-09-03T12:00:00Z');
const TODAY = DateOnly.parse('2026-09-03');
const deps = { ids: sequentialIds('gen'), clock: fixedClock(NOW) };

function athleteWith(overrides: Partial<AthleteSnapshot> = {}): Athlete {
  return Athlete.fromSnapshot({
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
    ...overrides,
  });
}

let sessions: InMemoryWorkoutSessionsRepository;
let exercises: InMemoryExercisesRepository;
let routines: InMemoryRoutinesRepository;
let templates: InMemoryTemplatesRepository;
let service: WorkoutLogService;

beforeEach(async () => {
  sessions = new InMemoryWorkoutSessionsRepository();
  exercises = new InMemoryExercisesRepository();
  routines = new InMemoryRoutinesRepository();
  templates = new InMemoryTemplatesRepository();

  service = new WorkoutLogService(
    sessions,
    exercises,
    new TrainingPlanService(routines, templates, exercises, sessions),
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

  it('converts minutes to a stored duration', async () => {
    await service.logSet(athleteWith(), TODAY, await benchId(), {
      durationMinutes: 30,
    });

    const set = (await sessions.findForDate('user-1', TODAY))!.sets[0];
    expect(set.duration?.inSeconds).toBe(1800);
  });

  it('records what the day was planned as when it opens the session', async () => {
    const template = WorkoutTemplate.create('user-1', 'Push', deps);
    template.addExercise(await benchId(), SetTarget.none(), deps);
    await templates.save(template);

    const routine = Routine.create('user-1', 'PPL', TODAY, deps);
    routine.addSlot(template.id, deps);
    routine.activate(NOW);
    await routines.save(routine);

    await service.logSet(athleteWith(), TODAY, await benchId(), { reps: 10 });

    const session = (await sessions.findForDate('user-1', TODAY))!;
    expect(session.plan).toEqual({
      routineId: routine.id,
      templateId: template.id,
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
