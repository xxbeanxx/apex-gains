import { describe } from 'vitest';

import { InMemoryAdminActionsRepository } from '~infrastructure/persistence/in-memory/admin-actions-repository';
import { InMemoryAthletesRepository } from '~infrastructure/persistence/in-memory/athletes-repository';
import { InMemoryBodyMeasurementsRepository } from '~infrastructure/persistence/in-memory/body-measurements-repository';
import { InMemoryBodyWeightRepository } from '~infrastructure/persistence/in-memory/body-weight-repository';
import { InMemoryEquipmentRepository } from '~infrastructure/persistence/in-memory/equipment-repository';
import { InMemoryExercisesRepository } from '~infrastructure/persistence/in-memory/exercises-repository';
import { InMemoryPlansRepository } from '~infrastructure/persistence/in-memory/plans-repository';
import { InMemoryWorkoutsRepository } from '~infrastructure/persistence/in-memory/workouts-repository';
import { InMemoryUnitOfWork } from '~infrastructure/persistence/in-memory/unit-of-work';
import { InMemorySessionsRepository } from '~infrastructure/persistence/in-memory/sessions-repository';

import { describeRepositoryContract, type RepositorySet } from './index';

/**
 * The in-memory family answering the same contract as Postgres.
 *
 * Every service test suite is built on these adapters, so this is what keeps
 * them from being their own oracle: a rule the in-memory store gets wrong is
 * a rule the service suites would happily confirm.
 */
function build(): RepositorySet {
  const athletes = new InMemoryAthletesRepository();
  const exercises = new InMemoryExercisesRepository();
  const workouts = new InMemoryWorkoutsRepository();
  const sessions = new InMemorySessionsRepository();
  const bodyWeight = new InMemoryBodyWeightRepository();
  const bodyMeasurements = new InMemoryBodyMeasurementsRepository();
  const plans = new InMemoryPlansRepository();
  const adminActions = new InMemoryAdminActionsRepository();

  // Postgres refuses to delete an exercise a workout or a logged set still
  // points at (`on delete restrict`). Nothing enforces that here unless the
  // referencing stores are named, so they are.
  exercises.referencedBy(workouts, sessions);
  // `athletes.remove` stands in for `on delete cascade`.
  athletes.ownedBy(exercises, workouts, plans, sessions, bodyWeight, bodyMeasurements);
  // ...and for `on delete set null`.
  athletes.referencedBy(adminActions);

  return {
    adminActions,
    athletes,
    bodyWeight,
    bodyMeasurements,
    equipment: new InMemoryEquipmentRepository(),
    exercises,
    plans,
    workouts,
    sessions,
    unitOfWork: new InMemoryUnitOfWork(),
  };
}

describe('in-memory adapters', () => {
  describeRepositoryContract({ name: 'in-memory', reset: async () => build() });
});
