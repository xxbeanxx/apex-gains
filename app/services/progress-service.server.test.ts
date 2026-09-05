import { beforeEach, describe, expect, it } from 'vitest';

import { Athlete } from '~/domain/athlete/athlete';
import { Exercise, type ExerciseSnapshot } from '~/domain/exercise/exercise';
import { fixedClock } from '~/domain/shared/clock';
import { sequentialIds } from '~/domain/shared/ids';
import { sequentialSecrets } from '~/domain/shared/secrets';
import { BodyWeightEntry } from '~/domain/bodyweight/body-weight-entry';
import { Session } from '~/domain/session/session';
import { DateOnly } from '~/domain/values/date-only';
import { Duration } from '~/domain/values/duration';
import { Weight } from '~/domain/values/weight';
import { InMemoryBodyWeightRepository } from '~/repositories/in-memory/body-weight-repository.server';
import { InMemoryExercisesRepository } from '~/repositories/in-memory/exercises-repository.server';
import { InMemorySessionsRepository } from '~/repositories/in-memory/sessions-repository.server';

import { ProgressService } from './progress-service.server';

const NOW = new Date('2026-09-03T12:00:00Z');
const TODAY = DateOnly.parse('2026-09-03');
const deps = { ids: sequentialIds('id'), clock: fixedClock(NOW), secrets: sequentialSecrets('token') };

function athlete(overrides: { weightUnit?: 'lb' | 'kg' } = {}): Athlete {
  return Athlete.fromSnapshot({
    id: 'user-1',
    googleSub: 'google-1',
    email: 'athlete@example.com',
    name: 'Athlete',
    avatarUrl: null,
    weightUnit: overrides.weightUnit ?? 'lb',
    distanceUnit: 'km',
    showSampleData: true,
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
let bodyWeight: InMemoryBodyWeightRepository;
let service: ProgressService;

beforeEach(() => {
  sessions = new InMemorySessionsRepository();
  exercises = new InMemoryExercisesRepository();
  bodyWeight = new InMemoryBodyWeightRepository();
  service = new ProgressService(sessions, exercises, bodyWeight);
});

async function openSession(date: string, isRestDay = false): Promise<Session> {
  const opened = Session.open('user-1', DateOnly.parse(date), { planId: null, workoutId: null, isRestDay }, deps);
  return sessions.add(opened);
}

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
