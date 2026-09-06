import { beforeEach, describe, expect, it } from 'vitest';

import { ProgressService } from '~application/use-cases/progress-service';
import { Athlete } from '~domain/athlete/athlete';
import { BodyMeasurement } from '~domain/body/body-measurement';
import { BodyWeightEntry } from '~domain/body/body-weight-entry';
import { Exercise, type ExerciseSnapshot } from '~domain/exercise/exercise';
import { Plan, type PlanSnapshot } from '~domain/plan/plan';
import { Session } from '~domain/session/session';
import { fixedClock } from '~domain/shared/clock';
import { sequentialIds } from '~domain/shared/ids';
import { sequentialSecrets } from '~domain/shared/secrets';
import { DateOnly } from '~domain/values/date-only';
import { Duration } from '~domain/values/duration';
import { Length } from '~domain/values/length';
import { Weight } from '~domain/values/weight';
import { Workout } from '~domain/workout/workout';
import { InMemoryBodyMeasurementsRepository } from '~infrastructure/persistence/in-memory/body-measurements-repository';
import { InMemoryBodyWeightRepository } from '~infrastructure/persistence/in-memory/body-weight-repository';
import { InMemoryExercisesRepository } from '~infrastructure/persistence/in-memory/exercises-repository';
import { InMemoryPlansRepository } from '~infrastructure/persistence/in-memory/plans-repository';
import { InMemorySessionsRepository } from '~infrastructure/persistence/in-memory/sessions-repository';
import { InMemoryWorkoutsRepository } from '~infrastructure/persistence/in-memory/workouts-repository';

const NOW = new Date('2026-09-03T12:00:00Z');
const TODAY = DateOnly.parse('2026-09-03');
const deps = { ids: sequentialIds('id'), clock: fixedClock(NOW), secrets: sequentialSecrets('token') };

function athlete(overrides: { weightUnit?: 'lb' | 'kg'; lengthUnit?: 'cm' | 'in' } = {}): Athlete {
  return Athlete.fromSnapshot({
    id: 'user-1',
    googleSub: 'google-1',
    email: 'athlete@example.com',
    name: 'Athlete',
    avatarUrl: null,
    weightUnit: overrides.weightUnit ?? 'lb',
    distanceUnit: 'km',
    lengthUnit: overrides.lengthUnit ?? 'in',
    showSampleData: true,
    defaultRestSeconds: null,
    timezone: 'UTC',
    isAdmin: false,
    createdAt: NOW,
    updatedAt: NOW,
  });
}

function exercise(overrides: Partial<ExerciseSnapshot> = {}): Exercise {
  return Exercise.fromSnapshot({
    id: 'bench',
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

let sessions: InMemorySessionsRepository;
let exercises: InMemoryExercisesRepository;
let workouts: InMemoryWorkoutsRepository;
let plans: InMemoryPlansRepository;
let bodyWeight: InMemoryBodyWeightRepository;
let bodyMeasurements: InMemoryBodyMeasurementsRepository;
let service: ProgressService;

beforeEach(() => {
  sessions = new InMemorySessionsRepository();
  exercises = new InMemoryExercisesRepository();
  workouts = new InMemoryWorkoutsRepository();
  plans = new InMemoryPlansRepository();
  bodyWeight = new InMemoryBodyWeightRepository();
  bodyMeasurements = new InMemoryBodyMeasurementsRepository();
  service = new ProgressService(sessions, exercises, workouts, plans, bodyWeight, bodyMeasurements);
});

async function openSession(date: string, isRestDay = false): Promise<Session> {
  const opened = Session.open('user-1', DateOnly.parse(date), { planId: null, workoutId: null, isRestDay }, deps);
  return sessions.add(opened);
}

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
    slots: [],
    ...overrides,
  });
}

describe('dashboard', () => {
  it("reports this week's sessions and sets, workouts logged over the recent window, and the active plan", async () => {
    await workouts.save(
      Workout.fromSnapshot({
        id: 'workout-1',
        userId: 'user-1',
        forkedFromId: null,
        name: 'Push Day',
        createdAt: NOW,
        updatedAt: NOW,
        exercises: [],
      }),
    );
    await plans.save(plan());

    // 2026-09-03 (NOW/TODAY) is a Thursday; its week runs Mon 2026-08-31
    // through Sun 2026-09-06.
    const inWeek = Session.open(
      'user-1',
      DateOnly.parse('2026-09-01'),
      { planId: 'plan-1', workoutId: 'workout-1', isRestDay: false },
      deps,
    );
    inWeek.logSet('bench', { reps: 8, weight: Weight.lb(135) }, deps);
    await sessions.save(inWeek);

    const restDay = Session.open(
      'user-1',
      DateOnly.parse('2026-09-02'),
      { planId: 'plan-1', workoutId: null, isRestDay: true },
      deps,
    );
    await sessions.save(restDay);

    // Outside this week - counts toward workoutsLogged but not the weekly figures.
    const lastWeek = Session.open(
      'user-1',
      DateOnly.parse('2026-08-20'),
      { planId: 'plan-1', workoutId: 'workout-1', isRestDay: false },
      deps,
    );
    lastWeek.logSet('bench', { reps: 5, weight: Weight.lb(200) }, deps);
    await sessions.save(lastWeek);

    const view = await service.dashboard(athlete());

    expect(view.sessionsThisWeek).toBe(2);
    expect(view.setsThisWeek).toBe(1);
    expect(view.workoutsLogged).toBe(2);
    expect(view.activePlanName).toBe('PPL');
    // Newest first: the rest day, then the workout day, then last week's.
    expect(view.recentSessions.map((s) => s.workoutName)).toEqual([null, 'Push Day', 'Push Day']);
  });

  it('reports no active plan when none is set', async () => {
    const view = await service.dashboard(athlete());

    expect(view.activePlanName).toBeNull();
    expect(view.sessionsThisWeek).toBe(0);
    expect(view.setsThisWeek).toBe(0);
    expect(view.workoutsLogged).toBe(0);
    expect(view.recentSessions).toEqual([]);
  });
});

describe('history', () => {
  it('counts total sets and only workouts with at least one set', async () => {
    await exercises.save(exercise());

    const trained = await openSession('2026-09-01');
    trained.logSet('bench', { reps: 8, weight: Weight.lb(135) }, deps);
    await sessions.save(trained);

    await openSession('2026-09-02', true); // rest day, no sets

    const view = await service.history(athlete(), TODAY);

    expect(view.totalSets).toBe(1);
    expect(view.workoutCount).toBe(1);
  });

  it('builds the timeline with resolved exercise names and formatted set summaries', async () => {
    await exercises.save(exercise());
    const opened = await openSession('2026-09-01');
    opened.logSet('bench', { reps: 8, weight: Weight.lb(135) }, deps);
    await sessions.save(opened);

    const view = await service.history(athlete(), TODAY);

    expect(view.timeline[0]).toMatchObject({
      date: '2026-09-01',
      isRestDay: false,
      sets: [{ exerciseId: 'bench', exerciseName: 'Bench Press', summary: '135 lb x 8' }],
    });
  });

  it('names the session’s workout and totals its tonnage in the timeline', async () => {
    await exercises.save(exercise());
    await workouts.save(
      Workout.fromSnapshot({
        id: 'workout-1',
        userId: 'user-1',
        forkedFromId: null,
        name: 'Push Day',
        createdAt: NOW,
        updatedAt: NOW,
        exercises: [],
      }),
    );
    const opened = Session.open(
      'user-1',
      DateOnly.parse('2026-09-01'),
      { planId: 'plan-1', workoutId: 'workout-1', isRestDay: false },
      deps,
    );
    opened.logSet('bench', { reps: 8, weight: Weight.lb(135) }, deps);
    opened.logSet('bench', { reps: 6, weight: Weight.lb(145) }, deps);
    await sessions.save(opened);

    const view = await service.history(athlete(), TODAY);

    expect(view.timeline[0]).toMatchObject({ workoutName: 'Push Day', tonnage: '1950 lb' });
  });

  it('reports no workout name and no tonnage for a rest day with nothing logged', async () => {
    await openSession('2026-09-01', true);

    const view = await service.history(athlete(), TODAY);

    expect(view.timeline[0]).toMatchObject({ workoutName: null, tonnage: null });
  });

  it('falls back to "Unknown" in the timeline for a set whose exercise is gone', async () => {
    // Exercise deliberately not saved.
    const opened = await openSession('2026-09-01');
    opened.logSet('bench', { reps: 8, weight: Weight.lb(135) }, deps);
    await sessions.save(opened);

    const view = await service.history(athlete(), TODAY);

    expect(view.timeline[0].sets[0].exerciseName).toBe('Unknown');
  });

  it('converts weekly tonnage into the athlete weight unit and rounds it', async () => {
    await exercises.save(exercise());
    const opened = await openSession('2026-09-01');
    opened.logSet('bench', { reps: 10, weight: Weight.lb(100) }, deps);
    await sessions.save(opened);

    const view = await service.history(athlete({ weightUnit: 'kg' }), TODAY);

    expect(view.tonnageUnit).toBe('kg');
    const currentWeek = view.weeklyTonnage.find((point) => point.isCurrentWeek);
    // 1000 lb of tonnage -> ~453.59 kg, rounded to 2 places.
    expect(currentWeek?.value).toBeCloseTo(453.59, 2);
  });

  /**
   * A single day is not a trend, so this needs two distinct training days -
   * see progressSeries's own two-point-minimum rule.
   */
  it('reports estimated 1RM progress in the athlete weight unit', async () => {
    await exercises.save(exercise());
    const day1 = await openSession('2026-09-01');
    day1.logSet('bench', { reps: 10, weight: Weight.lb(150) }, deps); // Epley: 150 * 4/3 = 200 lb
    await sessions.save(day1);
    const day2 = await openSession('2026-09-02');
    day2.logSet('bench', { reps: 10, weight: Weight.lb(180) }, deps); // Epley: 180 * 4/3 = 240 lb
    await sessions.save(day2);

    const view = await service.history(athlete(), TODAY);

    expect(view.exerciseProgress).toEqual([
      {
        exerciseId: 'bench',
        exerciseName: 'Bench Press',
        metricLabel: 'Est. best set (1RM)',
        unit: 'lb',
        points: [
          { date: '2026-09-01', value: 200 },
          { date: '2026-09-02', value: 240 },
        ],
      },
    ]);
  });

  it('reports duration progress in minutes for a cardio exercise', async () => {
    await exercises.save(exercise({ id: 'row', name: 'Rowing', exerciseType: 'cardio', muscleGroup: null }));
    const day1 = await openSession('2026-09-01');
    day1.logSet('row', { duration: Duration.minutes(20) }, deps);
    await sessions.save(day1);
    const day2 = await openSession('2026-09-02');
    day2.logSet('row', { duration: Duration.minutes(25) }, deps);
    await sessions.save(day2);

    const view = await service.history(athlete(), TODAY);

    expect(view.exerciseProgress).toEqual([
      {
        exerciseId: 'row',
        exerciseName: 'Rowing',
        metricLabel: 'Duration',
        unit: 'min',
        points: [
          { date: '2026-09-01', value: 20 },
          { date: '2026-09-02', value: 25 },
        ],
      },
    ]);
  });

  it('is null for body weight when fewer than two entries exist', async () => {
    const view = await service.history(athlete(), TODAY);
    expect(view.bodyWeight).toBeNull();
  });

  it('renders body weight as an oldest-first progress series in the athlete unit', async () => {
    await bodyWeight.save(BodyWeightEntry.record('user-1', DateOnly.parse('2026-08-01'), Weight.lb(180), deps));
    await bodyWeight.save(BodyWeightEntry.record('user-1', DateOnly.parse('2026-08-15'), Weight.lb(178), deps));

    const view = await service.history(athlete(), TODAY);

    expect(view.bodyWeight?.points.map((p) => p.date)).toEqual(['2026-08-01', '2026-08-15']);
    expect(view.bodyWeight?.points.map((p) => p.value)).toEqual([180, 178]);
  });
});

describe('bodyWeightLog', () => {
  it('lists entries newest first, converted to the athlete unit', async () => {
    await bodyWeight.save(BodyWeightEntry.record('user-1', DateOnly.parse('2026-08-01'), Weight.lb(200), deps));
    await bodyWeight.save(BodyWeightEntry.record('user-1', DateOnly.parse('2026-08-15'), Weight.lb(198), deps));

    const view = await service.bodyWeightLog(athlete({ weightUnit: 'kg' }));

    expect(view.unit).toBe('kg');
    expect(view.entries.map((e) => e.date)).toEqual(['2026-08-15', '2026-08-01']);
    expect(view.entries[0].weight).toBeCloseTo(89.81, 2);
  });

  it('needs at least two entries to produce a trend series', async () => {
    await bodyWeight.save(BodyWeightEntry.record('user-1', DateOnly.parse('2026-08-01'), Weight.lb(200), deps));

    const view = await service.bodyWeightLog(athlete());

    expect(view.series).toBeNull();
  });
});

describe('bodyMeasurementLog', () => {
  it('lists entries newest first, converted to the athlete unit, labelled by metric', async () => {
    await bodyMeasurements.save(BodyMeasurement.record('user-1', DateOnly.parse('2026-08-01'), 'waist', Length.cm(90), deps));
    await bodyMeasurements.save(BodyMeasurement.record('user-1', DateOnly.parse('2026-08-15'), 'waist', Length.cm(88), deps));

    const view = await service.bodyMeasurementLog(athlete({ lengthUnit: 'in' }), 'waist');

    expect(view.unit).toBe('in');
    expect(view.entries.map((e) => e.date)).toEqual(['2026-08-15', '2026-08-01']);
    expect(view.entries[0].value).toBeCloseTo(34.65, 2);
    expect(view.series?.exerciseName).toBe('Waist');
  });

  it('needs at least two entries to produce a trend series', async () => {
    await bodyMeasurements.save(BodyMeasurement.record('user-1', DateOnly.parse('2026-08-01'), 'waist', Length.cm(90), deps));

    const view = await service.bodyMeasurementLog(athlete(), 'waist');

    expect(view.series).toBeNull();
  });

  it('scopes entries to the requested metric', async () => {
    await bodyMeasurements.save(BodyMeasurement.record('user-1', DateOnly.parse('2026-08-01'), 'waist', Length.cm(90), deps));
    await bodyMeasurements.save(BodyMeasurement.record('user-1', DateOnly.parse('2026-08-01'), 'chest', Length.cm(102), deps));

    const view = await service.bodyMeasurementLog(athlete(), 'chest');

    expect(view.entries).toHaveLength(1);
    expect(view.entries[0].value).toBeCloseTo(102 / 2.54, 2);
  });
});
