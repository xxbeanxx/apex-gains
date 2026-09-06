import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { afterAll, beforeAll, describe } from 'vitest';

import { configureDatabase, db } from '~/db/index.server';

import { DrizzleAdminActionsRepository } from '../drizzle/admin-actions-repository.server';
import { DrizzleAthletesRepository } from '../drizzle/athletes-repository.server';
import { DrizzleBodyMeasurementsRepository } from '../drizzle/body-measurements-repository.server';
import { DrizzleBodyWeightRepository } from '../drizzle/body-weight-repository.server';
import { DrizzleEquipmentRepository } from '../drizzle/equipment-repository.server';
import { DrizzleExercisesRepository } from '../drizzle/exercises-repository.server';
import { DrizzlePlansRepository } from '../drizzle/plans-repository.server';
import { DrizzleWorkoutsRepository } from '../drizzle/workouts-repository.server';
import { DrizzleUnitOfWork } from '../drizzle/unit-of-work.server';
import { DrizzleSessionsRepository } from '../drizzle/sessions-repository.server';

import { describeRepositoryContract, type RepositorySet } from './index';

/**
 * The Drizzle family answering the same contract as the in-memory one.
 *
 * Needs a real Postgres, because the behaviour worth checking here is
 * exactly what a `Map` cannot imitate: `on delete restrict`, `on delete
 * cascade`, per-statement unique constraints, and conflict resolution. It is
 * skipped rather than failed when `TEST_DATABASE_URL` is unset, so the
 * ordinary `npm run test` stays offline - see README.md's "Repository
 * contract tests" for how to start one.
 *
 * The database it names is emptied between tests, so point it at a
 * throwaway, never at a database with anything in it.
 */
const url = process.env.TEST_DATABASE_URL;

/** Every table, children first, so a truncate needs no cascade reasoning. */
const TABLES = [
  'admin_actions',
  'session_sets',
  'sessions',
  'plan_slots',
  'plans',
  'workout_exercises',
  'workouts',
  'exercise_equipment',
  'exercises',
  'equipment',
  'body_weight_logs',
  'body_measurements',
  'users',
];

function build(): RepositorySet {
  return {
    adminActions: new DrizzleAdminActionsRepository(),
    athletes: new DrizzleAthletesRepository(),
    bodyWeight: new DrizzleBodyWeightRepository(),
    bodyMeasurements: new DrizzleBodyMeasurementsRepository(),
    equipment: new DrizzleEquipmentRepository(),
    exercises: new DrizzleExercisesRepository(),
    plans: new DrizzlePlansRepository(),
    workouts: new DrizzleWorkoutsRepository(),
    sessions: new DrizzleSessionsRepository(),
    unitOfWork: new DrizzleUnitOfWork(),
  };
}

describe.skipIf(!url)('drizzle adapters', () => {
  beforeAll(async () => {
    configureDatabase(url!);
    await migrate(db, { migrationsFolder: './drizzle' });
  });

  afterAll(async () => {
    await db.execute(sql.raw(`truncate table ${TABLES.join(', ')} cascade`));
  });

  describeRepositoryContract({
    name: 'drizzle',
    reset: async () => {
      await db.execute(sql.raw(`truncate table ${TABLES.join(', ')} cascade`));
      return build();
    },
  });
});
