import { AdminAction, type AdminActionKind } from '~/domain/admin/admin-action';
import { Athlete } from '~/domain/athlete/athlete';
import { BodyMeasurement, type BodyMeasurementMetric } from '~/domain/body/body-measurement';
import { BodyWeightEntry } from '~/domain/body/body-weight-entry';
import { Equipment } from '~/domain/equipment/equipment';
import { Exercise, type ExerciseSnapshot } from '~/domain/exercise/exercise';
import { Plan, type PlanSnapshot } from '~/domain/plan/plan';
import { fixedClock } from '~/domain/shared/clock';
import type { IdGenerator } from '~/domain/shared/ids';
import { sequentialSecrets } from '~/domain/shared/secrets';
import { Session, type SessionSnapshot } from '~/domain/session/session';
import { Workout, type WorkoutSnapshot } from '~/domain/workout/workout';
import { DateOnly } from '~/domain/values/date-only';
import { Weight } from '~/domain/values/weight';

import type { AdminActionsRepository } from '../admin-actions-repository.server';
import type { AthletesRepository } from '../athletes-repository.server';
import type { BodyMeasurementsRepository } from '../body-measurements-repository.server';
import type { BodyWeightRepository } from '../body-weight-repository.server';
import type { EquipmentRepository } from '../equipment-repository.server';
import type { ExercisesRepository } from '../exercises-repository.server';
import type { PlansRepository } from '../plans-repository.server';
import type { WorkoutsRepository } from '../workouts-repository.server';
import type { UnitOfWork } from '../unit-of-work.server';
import type { SessionsRepository } from '../sessions-repository.server';

/**
 * Every port at once. A contract seeds through the same interfaces it
 * asserts on, so it never needs a back door into an adapter's storage - which
 * is what lets the same suite run against both families.
 */
export type RepositorySet = {
  adminActions: AdminActionsRepository;
  athletes: AthletesRepository;
  bodyMeasurements: BodyMeasurementsRepository;
  bodyWeight: BodyWeightRepository;
  equipment: EquipmentRepository;
  exercises: ExercisesRepository;
  plans: PlansRepository;
  workouts: WorkoutsRepository;
  sessions: SessionsRepository;
  unitOfWork: UnitOfWork;
};

/**
 * What an adapter family supplies so the contract can run against it: a way
 * to get back to empty, and a name for the test output.
 *
 * `reset` returns a set that holds no rows at all. In-memory does that by
 * constructing new stores; Drizzle by truncating.
 */
export type ContractSubject = {
  readonly name: string;
  reset(): Promise<RepositorySet>;
};

export const NOW = new Date('2026-09-03T12:00:00Z');
export const EARLIER = new Date('2026-08-01T12:00:00Z');

/**
 * Deterministic ids that are still valid uuids: the columns are `uuid`, so
 * Postgres rejects anything else, and a contract that seeds through the
 * aggregates has to satisfy both adapters.
 */
export function sequentialUuids(): IdGenerator {
  let n = 0;
  return { next: () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}` };
}

export const deps = { ids: sequentialUuids(), clock: fixedClock(NOW), secrets: sequentialSecrets('share') };

/**
 * Ids are uuids because Postgres columns are `uuid` and will reject anything
 * else. Fixed rather than random so a failure names the same row twice.
 */
export const ids = {
  athlete: '11111111-1111-4111-8111-111111111111',
  otherAthlete: '22222222-2222-4222-8222-222222222222',
  own: '33333333-3333-4333-8333-333333333333',
  sample: '44444444-4444-4444-8444-444444444444',
  otherSample: '55555555-5555-4555-8555-555555555555',
  fork: '66666666-6666-4666-8666-666666666666',
  theirs: '77777777-7777-4777-8777-777777777777',
  extra: '88888888-8888-4888-8888-888888888888',
  child: '99999999-9999-4999-8999-999999999999',
  otherChild: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
};

export function athlete(id: string = ids.athlete, overrides: Partial<{ email: string; googleSub: string }> = {}): Athlete {
  return Athlete.fromSnapshot({
    id,
    googleSub: overrides.googleSub ?? `google-${id}`,
    email: overrides.email ?? `${id}@example.com`,
    name: 'Athlete',
    avatarUrl: null,
    weightUnit: 'lb',
    distanceUnit: 'km',
    lengthUnit: 'in',
    showSampleData: true,
    timezone: 'UTC',
    defaultRestSeconds: null,
    isAdmin: false,
    createdAt: NOW,
    updatedAt: NOW,
  });
}

export function exercise(overrides: Partial<ExerciseSnapshot> = {}): Exercise {
  return Exercise.fromSnapshot({
    id: ids.own,
    userId: ids.athlete,
    forkedFromId: null,
    name: 'Bench press',
    exerciseType: 'strength',
    muscleGroup: 'chest',
    description: null,
    createdAt: NOW,
    equipmentIds: [],
    ...overrides,
  });
}

export function workout(overrides: Partial<WorkoutSnapshot> = {}): Workout {
  return Workout.fromSnapshot({
    id: ids.own,
    userId: ids.athlete,
    forkedFromId: null,
    name: 'Push day',
    createdAt: NOW,
    updatedAt: NOW,
    exercises: [],
    ...overrides,
  });
}

export function plan(overrides: Partial<PlanSnapshot> = {}): Plan {
  return Plan.fromSnapshot({
    id: ids.own,
    userId: ids.athlete,
    forkedFromId: null,
    name: 'PPL',
    isActive: false,
    anchorDate: '2026-09-01',
    shareToken: null,
    createdAt: NOW,
    updatedAt: NOW,
    slots: [],
    ...overrides,
  });
}

export function session(overrides: Partial<SessionSnapshot> = {}): Session {
  return Session.fromSnapshot({
    id: ids.own,
    userId: ids.athlete,
    date: '2026-09-03',
    planId: null,
    workoutId: null,
    isRestDay: false,
    createdAt: NOW,
    updatedAt: NOW,
    sets: [],
    ...overrides,
  });
}

export function weighIn(id: string, date: string, pounds: number, userId: string = ids.athlete): BodyWeightEntry {
  return BodyWeightEntry.fromSnapshot({
    id,
    userId,
    date,
    // The column is `numeric`, which postgres-js reads back as a string, so
    // a snapshot always carries the string form.
    weight: pounds.toFixed(2),
    createdAt: NOW,
  });
}

export function measurement(
  id: string,
  date: string,
  metric: BodyMeasurementMetric,
  centimetres: number,
  userId: string = ids.athlete,
): BodyMeasurement {
  return BodyMeasurement.fromSnapshot({
    id,
    userId,
    date,
    metric,
    // The column is `numeric`, which postgres-js reads back as a string, so
    // a snapshot always carries the string form.
    value: centimetres.toFixed(2),
    createdAt: NOW,
  });
}

export function equipmentItem(id: string, name: string, userId: string | null = ids.athlete): Equipment {
  return Equipment.fromSnapshot({ id, userId, name, cardioKind: null, createdAt: NOW });
}

export function adminAction(
  overrides: Partial<{
    id: string;
    actorId: string | null;
    actorEmail: string;
    targetId: string | null;
    targetEmail: string;
    action: AdminActionKind;
    createdAt: Date;
  }> = {},
): AdminAction {
  return AdminAction.fromSnapshot({
    id: ids.own,
    actorId: ids.athlete,
    actorEmail: `${ids.athlete}@example.com`,
    targetId: ids.otherAthlete,
    targetEmail: `${ids.otherAthlete}@example.com`,
    action: 'grant-admin',
    createdAt: NOW,
    ...overrides,
  });
}

/** Seeds the athletes every other contract's foreign keys depend on. */
export async function seedAthletes(repositories: RepositorySet): Promise<void> {
  await repositories.athletes.save(athlete(ids.athlete));
  await repositories.athletes.save(athlete(ids.otherAthlete));
}

export { DateOnly, Weight };
