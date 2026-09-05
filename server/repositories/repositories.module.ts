import { Module, type Provider } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';

import { configureDatabase } from '~/db/index.server';
import { DrizzleAthletesRepository } from '~/repositories/drizzle/athletes-repository.server';
import { DrizzleBodyWeightRepository } from '~/repositories/drizzle/body-weight-repository.server';
import { DrizzleEquipmentRepository } from '~/repositories/drizzle/equipment-repository.server';
import { DrizzleExercisesRepository } from '~/repositories/drizzle/exercises-repository.server';
import { DrizzlePlansRepository } from '~/repositories/drizzle/plans-repository.server';
import { DrizzleWorkoutsRepository } from '~/repositories/drizzle/workouts-repository.server';
import { DrizzleUnitOfWork } from '~/repositories/drizzle/unit-of-work.server';
import { DrizzleSessionsRepository } from '~/repositories/drizzle/sessions-repository.server';
import { InMemoryAthletesRepository } from '~/repositories/in-memory/athletes-repository.server';
import { InMemoryBodyWeightRepository } from '~/repositories/in-memory/body-weight-repository.server';
import { InMemoryEquipmentRepository } from '~/repositories/in-memory/equipment-repository.server';
import { InMemoryExercisesRepository } from '~/repositories/in-memory/exercises-repository.server';
import { InMemoryPlansRepository } from '~/repositories/in-memory/plans-repository.server';
import { InMemoryWorkoutsRepository } from '~/repositories/in-memory/workouts-repository.server';
import { InMemoryUnitOfWork } from '~/repositories/in-memory/unit-of-work.server';
import { InMemorySessionsRepository } from '~/repositories/in-memory/sessions-repository.server';
import {
  ATHLETES_REPOSITORY,
  BODY_WEIGHT_REPOSITORY,
  EQUIPMENT_REPOSITORY,
  EXERCISES_REPOSITORY,
  PLANS_REPOSITORY,
  WORKOUTS_REPOSITORY,
  UNIT_OF_WORK,
  SESSIONS_REPOSITORY,
} from '~/repositories/tokens';

import { databaseConfig } from '../config/database.config';

type DatabaseConfig = ConfigType<typeof databaseConfig>;

/**
 * One `useFactory` provider per port, each picking Drizzle vs in-memory off
 * `databaseConfig.databaseUrl`. This is the only place that choice is made.
 *
 * The Drizzle adapter classes are safe to import statically even when
 * running in-memory: they only touch `~/db/index.server`'s lazy
 * `db`/`dbScope` proxies when a query actually runs, never at import time.
 */
function repositoryProvider<T>(token: symbol, create: (dbConfig: DatabaseConfig) => T): Provider {
  return {
    provide: token,
    inject: [databaseConfig.KEY],
    useFactory: (dbConfig: DatabaseConfig) => {
      // Hands the validated URL to `~/db/index.server` so nothing below has
      // to read `process.env` for itself. Connecting is still lazy; this only
      // decides what the connection will be made with.
      if (dbConfig.databaseUrl) configureDatabase(dbConfig.databaseUrl);
      return create(dbConfig);
    },
  };
}

/**
 * The in-memory family, built as one set.
 *
 * Separate `Map`s carry no foreign keys, so the two things Postgres does for
 * the adapters - refusing to delete an exercise something still points at,
 * and cascading an account's rows away with it - have to be wired by hand
 * (see `repositories/in-memory/references.ts`). Building them together is
 * the only place that can be done, which is why they are constructed here in
 * one go rather than one per provider.
 */
function buildInMemory() {
  const athletes = new InMemoryAthletesRepository();
  const exercises = new InMemoryExercisesRepository();
  const workouts = new InMemoryWorkoutsRepository();
  const plans = new InMemoryPlansRepository();
  const sessions = new InMemorySessionsRepository();
  const bodyWeight = new InMemoryBodyWeightRepository();

  exercises.referencedBy(workouts, sessions);
  athletes.ownedBy(exercises, workouts, plans, sessions, bodyWeight);

  return { athletes, exercises, workouts, plans, sessions, bodyWeight, equipment: new InMemoryEquipmentRepository() };
}

let inMemoryFamily: ReturnType<typeof buildInMemory> | undefined;

/** Built on first use, so a configured database constructs no stores at all. */
function inMemory(): ReturnType<typeof buildInMemory> {
  inMemoryFamily ??= buildInMemory();
  return inMemoryFamily;
}

const providers: Provider[] = [
  repositoryProvider(ATHLETES_REPOSITORY, (dbConfig) =>
    dbConfig.databaseUrl ? new DrizzleAthletesRepository() : inMemory().athletes,
  ),
  repositoryProvider(BODY_WEIGHT_REPOSITORY, (dbConfig) =>
    dbConfig.databaseUrl ? new DrizzleBodyWeightRepository() : inMemory().bodyWeight,
  ),
  repositoryProvider(EQUIPMENT_REPOSITORY, (dbConfig) =>
    dbConfig.databaseUrl ? new DrizzleEquipmentRepository() : inMemory().equipment,
  ),
  repositoryProvider(EXERCISES_REPOSITORY, (dbConfig) =>
    dbConfig.databaseUrl ? new DrizzleExercisesRepository() : inMemory().exercises,
  ),
  repositoryProvider(PLANS_REPOSITORY, (dbConfig) => (dbConfig.databaseUrl ? new DrizzlePlansRepository() : inMemory().plans)),
  repositoryProvider(WORKOUTS_REPOSITORY, (dbConfig) =>
    dbConfig.databaseUrl ? new DrizzleWorkoutsRepository() : inMemory().workouts,
  ),
  repositoryProvider(SESSIONS_REPOSITORY, (dbConfig) =>
    dbConfig.databaseUrl ? new DrizzleSessionsRepository() : inMemory().sessions,
  ),
  repositoryProvider(UNIT_OF_WORK, (dbConfig) => (dbConfig.databaseUrl ? new DrizzleUnitOfWork() : new InMemoryUnitOfWork())),
];

@Module({
  providers,
  exports: providers,
})
export class RepositoriesModule {}
