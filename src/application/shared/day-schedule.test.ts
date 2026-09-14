import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DaySchedule, type ScheduledDay, sessionPlanOf } from '~application/shared/day-schedule';
import { ReferenceDirectory } from '~application/shared/reference-directory';
import { Athlete } from '~domain/athlete/athlete';
import { Plan, type PlanSnapshot } from '~domain/plan/plan';
import { DateOnly } from '~domain/values/date-only';
import { Workout } from '~domain/workout/workout';
import { InMemoryPlansRepository } from '~infrastructure/persistence/in-memory/plans-repository';
import { inMemoryRepositories } from '~infrastructure/persistence/in-memory/repositories';
import { InMemoryWorkoutsRepository } from '~infrastructure/persistence/in-memory/workouts-repository';

const NOW = new Date('2026-09-01T12:00:00Z');

const athlete = Athlete.fromSnapshot({
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
});

/**
 * A three-day cycle anchored on 1 September: push, rest, pull.
 */
function activePlan(overrides: Partial<PlanSnapshot> = {}): Plan {
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
      { id: 'slot-0', position: 0, workoutId: 'push' },
      { id: 'slot-1', position: 1, workoutId: null },
      { id: 'slot-2', position: 2, workoutId: 'pull' },
    ],
    ...overrides,
  });
}

function workout(id: string, name: string, userId: string | null = 'user-1', forkedFromId: string | null = null): Workout {
  return Workout.fromSnapshot({
    id: id,
    userId: userId,
    forkedFromId: forkedFromId,
    name: name,
    createdAt: NOW,
    updatedAt: NOW,
    exercises: [],
  });
}

function summary(day: ScheduledDay): string {
  return day.type === 'workout' ? `workout:${day.workout.id}` : day.type;
}

const days = (...values: string[]) => values.map((value) => DateOnly.parse(value));

let plans: InMemoryPlansRepository;
let workouts: InMemoryWorkoutsRepository;
let schedule: DaySchedule;

beforeEach(() => {
  const stores = inMemoryRepositories();
  plans = stores.plans;
  workouts = stores.workouts;
  schedule = new DaySchedule(plans, new ReferenceDirectory(stores.exercises, workouts, stores.equipment));
});

describe('on and across', () => {
  it('reads each date off the cycle - a workout, a rest day, and round again', async () => {
    await plans.save(activePlan());
    await workouts.save(workout('push', 'Push'));
    await workouts.save(workout('pull', 'Pull'));

    const across = await schedule.across(athlete, days('2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04'));

    expect(across.map(summary)).toEqual(['workout:push', 'rest', 'workout:pull', 'workout:push']);
    expect(summary(await schedule.on(athlete, DateOnly.parse('2026-09-03')))).toBe('workout:pull');
  });

  it('is "none" with no active plan, or an active plan with no slots', async () => {
    expect((await schedule.across(athlete, days('2026-09-01', '2026-09-02'))).map(summary)).toEqual(['none', 'none']);

    await plans.save(activePlan({ slots: [] }));
    expect(summary(await schedule.on(athlete, DateOnly.parse('2026-09-01')))).toBe('none');
  });

  it("schedules the athlete's fork of a sample workout the slot names", async () => {
    await plans.save(activePlan());
    await workouts.save(workout('push', 'Push', null));
    await workouts.save(workout('my-push', 'My Push', 'user-1', 'push'));

    const day = await schedule.on(athlete, DateOnly.parse('2026-09-01'));

    expect(day).toMatchObject({ type: 'workout', planId: 'plan-1', workout: { id: 'my-push', name: 'My Push' } });
  });

  /**
   * The schema nulls a deleted workout's slots, so only broken data gets
   * here - but a day and the week ahead read it the same way.
   */
  it('reads a slot whose workout resolves to nothing as rest, for one date or many', async () => {
    await plans.save(activePlan());
    await workouts.save(workout('pull', 'Pull'));

    expect(await schedule.on(athlete, DateOnly.parse('2026-09-01'))).toEqual({ type: 'rest', planId: 'plan-1' });
    expect((await schedule.across(athlete, days('2026-09-01', '2026-09-03'))).map(summary)).toEqual(['rest', 'workout:pull']);
  });

  it('reads the plan once and resolves only the workouts the dates land on, once each', async () => {
    await plans.save(activePlan());
    await workouts.save(workout('push', 'Push'));
    const findActive = vi.spyOn(plans, 'findActive');
    const findWorkouts = vi.spyOn(workouts, 'findManyByIds');

    await schedule.across(athlete, days('2026-09-01', '2026-09-02', '2026-09-04', '2026-09-07'));

    expect(findActive).toHaveBeenCalledTimes(1);
    expect(findWorkouts).toHaveBeenCalledTimes(1);
    expect(findWorkouts.mock.calls[0]![0]).toEqual(['push']);
  });
});

describe('sessionPlanOf', () => {
  it('records the plan and the workout for a workout day', () => {
    expect(sessionPlanOf({ type: 'workout', planId: 'plan-1', workout: workout('push', 'Push') })).toEqual({
      planId: 'plan-1',
      workoutId: 'push',
      isRestDay: false,
    });
  });

  it('records the plan and no workout for a rest day', () => {
    expect(sessionPlanOf({ type: 'rest', planId: 'plan-1' })).toEqual({ planId: 'plan-1', workoutId: null, isRestDay: true });
  });

  it('records nothing for a day with nothing scheduled', () => {
    expect(sessionPlanOf({ type: 'none' })).toEqual({ planId: null, workoutId: null, isRestDay: false });
  });
});
