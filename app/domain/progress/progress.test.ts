import { describe, expect, it } from 'vitest';

import { Exercise, type ExerciseSnapshot } from '../exercise/exercise';
import type { ExerciseType } from '../exercise/exercise-type';
import { fixedClock } from '../shared/clock';
import { sequentialIds } from '../shared/ids';
import { WorkoutSession } from '../session/workout-session';
import { DateOnly } from '../values/date-only';
import { Duration } from '../values/duration';
import { Weight } from '../values/weight';
import { muscleGroupBalance, OTHER_MUSCLE_GROUP } from './muscle-balance';
import { estimatedOneRepMax, personalRecords, progressSeries } from './personal-records';
import { TrainingHistory } from './training-history';
import { consistencyCalendar, weeklySetCount, weeklyTonnage } from './weekly-volume';

// 2026-09-03 is a Thursday; its week starts Monday 2026-08-31.
const TODAY = DateOnly.parse('2026-09-03');
const NOW = new Date('2026-09-03T12:00:00Z');

function exercise(id: string, overrides: Partial<ExerciseSnapshot> = {}): Exercise {
  return Exercise.fromSnapshot({
    id,
    userId: 'user-1',
    forkedFromId: null,
    name: id,
    exerciseType: 'strength' as ExerciseType,
    muscleGroup: null,
    description: null,
    createdAt: NOW,
    equipmentIds: [],
    ...overrides,
  });
}

type SetSpec = {
  exerciseId: string;
  reps?: number;
  weightLb?: number;
  minutes?: number;
};

function session(date: string, sets: SetSpec[], isRestDay = false): WorkoutSession {
  const deps = { ids: sequentialIds(`s-${date}`), clock: fixedClock(NOW) };
  const built = WorkoutSession.open('user-1', DateOnly.parse(date), { routineId: null, templateId: null, isRestDay }, deps);
  for (const spec of sets) {
    built.logSet(
      spec.exerciseId,
      {
        reps: spec.reps ?? null,
        weight: spec.weightLb != null ? Weight.lb(spec.weightLb) : null,
        duration: spec.minutes != null ? Duration.minutes(spec.minutes) : null,
      },
      deps,
    );
  }
  return built;
}

describe('weekly volume', () => {
  it('counts sets into the week they fall in', () => {
    const history = TrainingHistory.of(
      [
        session('2026-09-01', [{ exerciseId: 'bench', reps: 10 }]),
        session('2026-09-03', [
          { exerciseId: 'bench', reps: 10 },
          { exerciseId: 'row', reps: 10 },
        ]),
      ],
      [exercise('bench'), exercise('row')],
    );

    const points = weeklySetCount(history, 2, TODAY);

    expect(points).toHaveLength(2);
    expect(points[1].value).toBe(3);
    expect(points[1].isCurrentWeek).toBe(true);
  });

  /**
   * A break in training should look like a break, not like a shorter chart -
   * so empty weeks still appear, carrying zero.
   */
  it('keeps empty weeks in the series', () => {
    const history = TrainingHistory.of([session('2026-09-03', [{ exerciseId: 'bench', reps: 10 }])], [exercise('bench')]);

    const points = weeklySetCount(history, 4, TODAY);

    expect(points.map((p) => p.value)).toEqual([0, 0, 0, 1]);
    expect(points.map((p) => p.weekStart.value)).toEqual(['2026-08-10', '2026-08-17', '2026-08-24', '2026-08-31']);
  });

  it('sums tonnage as weight times reps', () => {
    const history = TrainingHistory.of(
      [
        session('2026-09-03', [
          { exerciseId: 'bench', reps: 10, weightLb: 100 },
          { exerciseId: 'bench', reps: 8, weightLb: 110 },
        ]),
      ],
      [exercise('bench')],
    );

    expect(weeklyTonnage(history, 1, TODAY)[0].value.inPounds).toBe(1880);
  });

  it('excludes bodyweight and cardio work from tonnage', () => {
    const history = TrainingHistory.of(
      [
        session('2026-09-03', [
          { exerciseId: 'pullup', reps: 10 },
          { exerciseId: 'treadmill', minutes: 30 },
        ]),
      ],
      [exercise('pullup'), exercise('treadmill', { exerciseType: 'cardio' })],
    );

    expect(weeklyTonnage(history, 1, TODAY)[0].value.inPounds).toBe(0);
  });
});

describe('consistency calendar', () => {
  it('emits a Monday-aligned grid of whole weeks', () => {
    const history = TrainingHistory.of([], []);
    const days = consistencyCalendar(history, 2, TODAY);

    expect(days).toHaveLength(14);
    expect(days[0].date.value).toBe('2026-08-24');
    expect(days.every((d) => d.status === 'none')).toBe(true);
  });

  it('distinguishes a rest day from a day with nothing recorded', () => {
    const history = TrainingHistory.of(
      [session('2026-09-01', [], true), session('2026-09-02', [{ exerciseId: 'bench', reps: 10 }])],
      [exercise('bench')],
    );

    const byDate = new Map(consistencyCalendar(history, 1, TODAY).map((d) => [d.date.value, d]));

    expect(byDate.get('2026-09-01')?.status).toBe('rest');
    expect(byDate.get('2026-09-02')?.status).toBe('workout');
    expect(byDate.get('2026-09-04')?.status).toBe('none');
  });
});

describe('muscle group balance', () => {
  it('counts sets per muscle group, most-trained first', () => {
    const history = TrainingHistory.of(
      [
        session('2026-09-03', [
          { exerciseId: 'bench', reps: 10 },
          { exerciseId: 'fly', reps: 10 },
          { exerciseId: 'row', reps: 10 },
        ]),
      ],
      [
        exercise('bench', { muscleGroup: 'Chest' }),
        exercise('fly', { muscleGroup: 'chest' }),
        exercise('row', { muscleGroup: 'Back' }),
      ],
    );

    expect(muscleGroupBalance(history, 28, TODAY)).toEqual([
      { muscleGroup: 'Chest', setCount: 2 },
      { muscleGroup: 'Back', setCount: 1 },
    ]);
  });

  it('files exercises with no muscle group under Other', () => {
    const history = TrainingHistory.of(
      [session('2026-09-03', [{ exerciseId: 'bench', reps: 10 }])],
      [exercise('bench', { muscleGroup: '   ' })],
    );

    expect(muscleGroupBalance(history, 28, TODAY)).toEqual([{ muscleGroup: OTHER_MUSCLE_GROUP, setCount: 1 }]);
  });

  it('ignores sets outside the window', () => {
    const history = TrainingHistory.of(
      [session('2026-07-01', [{ exerciseId: 'bench', reps: 10 }])],
      [exercise('bench', { muscleGroup: 'Chest' })],
    );

    expect(muscleGroupBalance(history, 28, TODAY)).toEqual([]);
  });
});

describe('estimated one-rep max', () => {
  it('returns the weight itself for a single rep', () => {
    expect(estimatedOneRepMax(Weight.lb(100), 1).inPounds).toBeCloseTo(103.33, 2);
  });

  it('rates more reps at the same weight higher', () => {
    const five = estimatedOneRepMax(Weight.lb(100), 5).inPounds;
    const ten = estimatedOneRepMax(Weight.lb(100), 10).inPounds;
    expect(ten).toBeGreaterThan(five);
  });
});

describe('progress series and records', () => {
  it('tracks weighted work by estimated 1RM', () => {
    const history = TrainingHistory.of(
      [
        session('2026-09-01', [{ exerciseId: 'bench', reps: 10, weightLb: 100 }]),
        session('2026-09-03', [{ exerciseId: 'bench', reps: 8, weightLb: 110 }]),
      ],
      [exercise('bench')],
    );

    const [series] = progressSeries(history);

    expect(series.kind).toBe('one-rep-max');
    expect(series.points.map((p) => p.date)).toEqual(['2026-09-01', '2026-09-03']);
  });

  it('tracks bodyweight-only work by reps', () => {
    const history = TrainingHistory.of(
      [session('2026-09-01', [{ exerciseId: 'pullup', reps: 8 }]), session('2026-09-03', [{ exerciseId: 'pullup', reps: 10 }])],
      [exercise('pullup')],
    );

    const [series] = progressSeries(history);
    expect(series.kind).toBe('reps');
    expect(series.points.map((p) => p.value)).toEqual([8, 10]);
  });

  it('tracks cardio by duration, in seconds', () => {
    const history = TrainingHistory.of(
      [
        session('2026-09-01', [{ exerciseId: 'treadmill', minutes: 20 }]),
        session('2026-09-03', [{ exerciseId: 'treadmill', minutes: 30 }]),
      ],
      [exercise('treadmill', { exerciseType: 'cardio' })],
    );

    const [series] = progressSeries(history);
    expect(series.kind).toBe('duration');
    expect(series.points.map((p) => p.value)).toEqual([1200, 1800]);
  });

  /**
   * An exercise that has ever been loaded is measured by 1RM for its whole
   * history, so a series never mixes pounds with rep counts.
   */
  it('keeps one metric for an exercise that was sometimes unweighted', () => {
    const history = TrainingHistory.of(
      [
        session('2026-09-01', [{ exerciseId: 'pullup', reps: 8 }]),
        session('2026-09-03', [{ exerciseId: 'pullup', reps: 5, weightLb: 25 }]),
      ],
      [exercise('pullup')],
    );

    const [record] = personalRecords(history);
    expect(record.kind).toBe('one-rep-max');
    // The unweighted day yields no 1RM at all, so it drops out entirely -
    // leaving a single day, which is a record but not yet a trend.
    expect(record.date).toBe('2026-09-03');
    expect(progressSeries(history)).toEqual([]);
  });

  it('keeps only the best value on a day', () => {
    const history = TrainingHistory.of(
      [
        session('2026-09-01', [
          { exerciseId: 'pullup', reps: 8 },
          { exerciseId: 'pullup', reps: 12 },
          { exerciseId: 'pullup', reps: 6 },
        ]),
        session('2026-09-03', [{ exerciseId: 'pullup', reps: 9 }]),
      ],
      [exercise('pullup')],
    );

    expect(progressSeries(history)[0].points.map((p) => p.value)).toEqual([12, 9]);
  });

  it('needs two distinct days before it calls something a trend', () => {
    const history = TrainingHistory.of(
      [session('2026-09-03', [{ exerciseId: 'bench', reps: 10, weightLb: 100 }])],
      [exercise('bench')],
    );

    expect(progressSeries(history)).toEqual([]);
    // A single day is still a personal record, though.
    expect(personalRecords(history)).toHaveLength(1);
  });

  it("reports each exercise's all-time best", () => {
    const history = TrainingHistory.of(
      [session('2026-09-01', [{ exerciseId: 'pullup', reps: 12 }]), session('2026-09-03', [{ exerciseId: 'pullup', reps: 9 }])],
      [exercise('pullup')],
    );

    expect(personalRecords(history)).toEqual([
      {
        exerciseId: 'pullup',
        exerciseName: 'pullup',
        kind: 'reps',
        value: 12,
        date: '2026-09-01',
      },
    ]);
  });

  it('awards a tied record to the day it was first reached', () => {
    const history = TrainingHistory.of(
      [
        session('2026-09-01', [{ exerciseId: 'pullup', reps: 10 }]),
        session('2026-09-03', [{ exerciseId: 'pullup', reps: 10 }]),
      ],
      [exercise('pullup')],
    );

    expect(personalRecords(history)[0].date).toBe('2026-09-01');
  });

  it('ignores sets whose exercise it cannot resolve', () => {
    const history = TrainingHistory.of([session('2026-09-03', [{ exerciseId: 'ghost', reps: 10 }])], []);

    expect(progressSeries(history)).toEqual([]);
    expect(personalRecords(history)).toEqual([]);
  });
});
