import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { afterAll, beforeAll, describe } from 'vitest';

import { configureDatabase, db } from '~/db/index.server';

import { DrizzleAthletesRepository } from '../drizzle/athletes-repository.server';
import { DrizzleBodyWeightRepository } from '../drizzle/body-weight-repository.server';
import { DrizzleEquipmentRepository } from '../drizzle/equipment-repository.server';
import { DrizzleExercisesRepository } from '../drizzle/exercises-repository.server';
import { DrizzleRoutinesRepository } from '../drizzle/routines-repository.server';
import { DrizzleTemplatesRepository } from '../drizzle/templates-repository.server';
import { DrizzleUnitOfWork } from '../drizzle/unit-of-work.server';
import { DrizzleWorkoutSessionsRepository } from '../drizzle/workout-sessions-repository.server';

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
  'session_sets',
  'workout_sessions',
  'routine_slots',
  'routines',
  'template_exercises',
  'templates',
  'exercise_equipment',
  'exercises',
  'equipment',
  'body_weight_logs',
  'users',
];

function build(): RepositorySet {
  return {
    athletes: new DrizzleAthletesRepository(),
    bodyWeight: new DrizzleBodyWeightRepository(),
    equipment: new DrizzleEquipmentRepository(),
    exercises: new DrizzleExercisesRepository(),
    routines: new DrizzleRoutinesRepository(),
    templates: new DrizzleTemplatesRepository(),
    sessions: new DrizzleWorkoutSessionsRepository(),
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
