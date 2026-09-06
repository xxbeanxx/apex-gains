import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { afterAll, beforeAll, describe } from 'vitest';

import { configureDatabase, db } from '~infrastructure/persistence/drizzle/index';

import { DrizzleAdminActionsRepository } from '~infrastructure/persistence/drizzle/admin-actions-repository';
import { DrizzleAthletesRepository } from '~infrastructure/persistence/drizzle/athletes-repository';
import { DrizzleBodyMeasurementsRepository } from '~infrastructure/persistence/drizzle/body-measurements-repository';
import { DrizzleBodyWeightRepository } from '~infrastructure/persistence/drizzle/body-weight-repository';
import { DrizzleEquipmentRepository } from '~infrastructure/persistence/drizzle/equipment-repository';
import { DrizzleExercisesRepository } from '~infrastructure/persistence/drizzle/exercises-repository';
import { DrizzlePlansRepository } from '~infrastructure/persistence/drizzle/plans-repository';
import { DrizzleWorkoutsRepository } from '~infrastructure/persistence/drizzle/workouts-repository';
import { DrizzleUnitOfWork } from '~infrastructure/persistence/drizzle/unit-of-work';
import { DrizzleSessionsRepository } from '~infrastructure/persistence/drizzle/sessions-repository';

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
