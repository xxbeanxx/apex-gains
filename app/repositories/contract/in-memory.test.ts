import { describe } from 'vitest';

import { InMemoryAthletesRepository } from '../in-memory/athletes-repository.server';
import { InMemoryBodyWeightRepository } from '../in-memory/body-weight-repository.server';
import { InMemoryEquipmentRepository } from '../in-memory/equipment-repository.server';
import { InMemoryExercisesRepository } from '../in-memory/exercises-repository.server';
import { InMemoryPlansRepository } from '../in-memory/plans-repository.server';
import { InMemoryWorkoutsRepository } from '../in-memory/workouts-repository.server';
import { InMemoryUnitOfWork } from '../in-memory/unit-of-work.server';
import { InMemorySessionsRepository } from '../in-memory/sessions-repository.server';

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
  const plans = new InMemoryPlansRepository();

  // Postgres refuses to delete an exercise a workout or a logged set still
  // points at (`on delete restrict`). Nothing enforces that here unless the
  // referencing stores are named, so they are.
  exercises.referencedBy(workouts, sessions);
  // `athletes.remove` stands in for `on delete cascade`.
  athletes.ownedBy(exercises, workouts, plans, sessions, bodyWeight);

  return {
    athletes,
    bodyWeight,
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
