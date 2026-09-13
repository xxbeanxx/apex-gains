import { Module, type Provider } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';

import { DrizzleAdminActionsRepository } from '~infrastructure/persistence/drizzle/admin-actions-repository';
import { DrizzleAthletesRepository } from '~infrastructure/persistence/drizzle/athletes-repository';
import { DrizzleBodyMeasurementsRepository } from '~infrastructure/persistence/drizzle/body-measurements-repository';
import { DrizzleBodyWeightRepository } from '~infrastructure/persistence/drizzle/body-weight-repository';
import { DrizzleEquipmentRepository } from '~infrastructure/persistence/drizzle/equipment-repository';
import { DrizzleExercisesRepository } from '~infrastructure/persistence/drizzle/exercises-repository';
import { configureDatabase } from '~infrastructure/persistence/drizzle/index';
import { DrizzlePlansRepository } from '~infrastructure/persistence/drizzle/plans-repository';
import { DrizzleSessionsRepository } from '~infrastructure/persistence/drizzle/sessions-repository';
import { DrizzleUnitOfWork } from '~infrastructure/persistence/drizzle/unit-of-work';
import { DrizzleWorkoutsRepository } from '~infrastructure/persistence/drizzle/workouts-repository';
import { type InMemoryRepositories, inMemoryRepositories } from '~infrastructure/persistence/in-memory/repositories';
import { databaseConfig } from '~server/config/database.config';
import {
  ADMIN_ACTIONS_REPOSITORY,
  ATHLETES_REPOSITORY,
  BODY_MEASUREMENTS_REPOSITORY,
  BODY_WEIGHT_REPOSITORY,
  EQUIPMENT_REPOSITORY,
  EXERCISES_REPOSITORY,
  PLANS_REPOSITORY,
  SESSIONS_REPOSITORY,
  UNIT_OF_WORK,
  WORKOUTS_REPOSITORY,
} from '~server/providers/persistence.tokens';

type DatabaseConfig = ConfigType<typeof databaseConfig>;

/**
 * One `useFactory` provider per port, each picking Drizzle vs in-memory off
 * `databaseConfig.databaseUrl`. This is the only place that choice is made.
 *
 * The Drizzle adapter classes are safe to import statically even when
 * running in-memory: they only touch `~infrastructure/persistence/drizzle/index`'s lazy
 * `db`/`dbScope` proxies when a query actually runs, never at import time.
 */
function repositoryProvider<T>(token: symbol, create: (dbConfig: DatabaseConfig) => T): Provider {
  return {
    provide: token,
    inject: [databaseConfig.KEY],
    useFactory: (dbConfig: DatabaseConfig) => {
      // Hands the validated URL to `~infrastructure/persistence/drizzle/index` so nothing below has
      // to read `process.env` for itself. Connecting is still lazy; this only
      // decides what the connection will be made with.
      if (dbConfig.databaseUrl) {
        configureDatabase(dbConfig.databaseUrl);
      }

      return create(dbConfig);
    },
  };
}

let inMemoryFamily: InMemoryRepositories | undefined;

/**
 * One in-memory family for the whole process, built on first use - so a
 * configured database constructs no stores at all, and every port that does
 * fall back shares the one set whose stores are wired to each other.
 */
function inMemory(): InMemoryRepositories {
  inMemoryFamily ??= inMemoryRepositories();
  return inMemoryFamily;
}

const providers: Provider[] = [
  repositoryProvider(ADMIN_ACTIONS_REPOSITORY, (dbConfig) => {
    return dbConfig.databaseUrl ? new DrizzleAdminActionsRepository() : inMemory().adminActions;
  }),
  repositoryProvider(ATHLETES_REPOSITORY, (dbConfig) => {
    return dbConfig.databaseUrl ? new DrizzleAthletesRepository() : inMemory().athletes;
  }),
  repositoryProvider(BODY_MEASUREMENTS_REPOSITORY, (dbConfig) => {
    return dbConfig.databaseUrl ? new DrizzleBodyMeasurementsRepository() : inMemory().bodyMeasurements;
  }),
  repositoryProvider(BODY_WEIGHT_REPOSITORY, (dbConfig) => {
    return dbConfig.databaseUrl ? new DrizzleBodyWeightRepository() : inMemory().bodyWeight;
  }),
  repositoryProvider(EQUIPMENT_REPOSITORY, (dbConfig) => {
    return dbConfig.databaseUrl ? new DrizzleEquipmentRepository() : inMemory().equipment;
  }),
  repositoryProvider(EXERCISES_REPOSITORY, (dbConfig) => {
    return dbConfig.databaseUrl ? new DrizzleExercisesRepository() : inMemory().exercises;
  }),
  repositoryProvider(PLANS_REPOSITORY, (dbConfig) => {
    return dbConfig.databaseUrl ? new DrizzlePlansRepository() : inMemory().plans;
  }),
  repositoryProvider(WORKOUTS_REPOSITORY, (dbConfig) => {
    return dbConfig.databaseUrl ? new DrizzleWorkoutsRepository() : inMemory().workouts;
  }),
  repositoryProvider(SESSIONS_REPOSITORY, (dbConfig) => {
    return dbConfig.databaseUrl ? new DrizzleSessionsRepository() : inMemory().sessions;
  }),
  repositoryProvider(UNIT_OF_WORK, (dbConfig) => {
    return dbConfig.databaseUrl ? new DrizzleUnitOfWork() : inMemory().unitOfWork;
  }),
];

@Module({
  providers: providers,
  exports: providers,
})
export class RepositoriesModule {}
