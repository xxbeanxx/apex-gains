import { Module, type Provider } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';

import { configureDatabase } from '~/db/index.server';
import { DrizzleAthletesRepository } from '~/repositories/drizzle/athletes-repository.server';
import { DrizzleBodyWeightRepository } from '~/repositories/drizzle/body-weight-repository.server';
import { DrizzleEquipmentRepository } from '~/repositories/drizzle/equipment-repository.server';
import { DrizzleExercisesRepository } from '~/repositories/drizzle/exercises-repository.server';
import { DrizzleRoutinesRepository } from '~/repositories/drizzle/routines-repository.server';
import { DrizzleTemplatesRepository } from '~/repositories/drizzle/templates-repository.server';
import { DrizzleUnitOfWork } from '~/repositories/drizzle/unit-of-work.server';
import { DrizzleWorkoutSessionsRepository } from '~/repositories/drizzle/workout-sessions-repository.server';
import { InMemoryAthletesRepository } from '~/repositories/in-memory/athletes-repository.server';
import { InMemoryBodyWeightRepository } from '~/repositories/in-memory/body-weight-repository.server';
import { InMemoryEquipmentRepository } from '~/repositories/in-memory/equipment-repository.server';
import { InMemoryExercisesRepository } from '~/repositories/in-memory/exercises-repository.server';
import { InMemoryRoutinesRepository } from '~/repositories/in-memory/routines-repository.server';
import { InMemoryTemplatesRepository } from '~/repositories/in-memory/templates-repository.server';
import { InMemoryUnitOfWork } from '~/repositories/in-memory/unit-of-work.server';
import { InMemoryWorkoutSessionsRepository } from '~/repositories/in-memory/workout-sessions-repository.server';
import {
  ATHLETES_REPOSITORY,
  BODY_WEIGHT_REPOSITORY,
  EQUIPMENT_REPOSITORY,
  EXERCISES_REPOSITORY,
  ROUTINES_REPOSITORY,
  TEMPLATES_REPOSITORY,
  UNIT_OF_WORK,
  WORKOUT_SESSIONS_REPOSITORY,
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

const providers: Provider[] = [
  repositoryProvider(ATHLETES_REPOSITORY, (dbConfig) =>
    dbConfig.databaseUrl ? new DrizzleAthletesRepository() : new InMemoryAthletesRepository(),
  ),
  repositoryProvider(BODY_WEIGHT_REPOSITORY, (dbConfig) =>
    dbConfig.databaseUrl ? new DrizzleBodyWeightRepository() : new InMemoryBodyWeightRepository(),
  ),
  repositoryProvider(EQUIPMENT_REPOSITORY, (dbConfig) =>
    dbConfig.databaseUrl ? new DrizzleEquipmentRepository() : new InMemoryEquipmentRepository(),
  ),
  repositoryProvider(EXERCISES_REPOSITORY, (dbConfig) =>
    dbConfig.databaseUrl ? new DrizzleExercisesRepository() : new InMemoryExercisesRepository(),
  ),
  repositoryProvider(ROUTINES_REPOSITORY, (dbConfig) =>
    dbConfig.databaseUrl ? new DrizzleRoutinesRepository() : new InMemoryRoutinesRepository(),
  ),
  repositoryProvider(TEMPLATES_REPOSITORY, (dbConfig) =>
    dbConfig.databaseUrl ? new DrizzleTemplatesRepository() : new InMemoryTemplatesRepository(),
  ),
  repositoryProvider(WORKOUT_SESSIONS_REPOSITORY, (dbConfig) =>
    dbConfig.databaseUrl ? new DrizzleWorkoutSessionsRepository() : new InMemoryWorkoutSessionsRepository(),
  ),
  repositoryProvider(UNIT_OF_WORK, (dbConfig) => (dbConfig.databaseUrl ? new DrizzleUnitOfWork() : new InMemoryUnitOfWork())),
];

@Module({
  providers,
  exports: providers,
})
export class RepositoriesModule {}
