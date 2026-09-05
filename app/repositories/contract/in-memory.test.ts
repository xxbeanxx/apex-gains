import { describe } from 'vitest';

import { InMemoryAthletesRepository } from '../in-memory/athletes-repository.server';
import { InMemoryBodyWeightRepository } from '../in-memory/body-weight-repository.server';
import { InMemoryEquipmentRepository } from '../in-memory/equipment-repository.server';
import { InMemoryExercisesRepository } from '../in-memory/exercises-repository.server';
import { InMemoryRoutinesRepository } from '../in-memory/routines-repository.server';
import { InMemoryTemplatesRepository } from '../in-memory/templates-repository.server';
import { InMemoryUnitOfWork } from '../in-memory/unit-of-work.server';
import { InMemoryWorkoutSessionsRepository } from '../in-memory/workout-sessions-repository.server';

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
  const templates = new InMemoryTemplatesRepository();
  const sessions = new InMemoryWorkoutSessionsRepository();
  const bodyWeight = new InMemoryBodyWeightRepository();
  const routines = new InMemoryRoutinesRepository();

  // Postgres refuses to delete an exercise a template or a logged set still
  // points at (`on delete restrict`). Nothing enforces that here unless the
  // referencing stores are named, so they are.
  exercises.referencedBy(templates, sessions);
  // `athletes.remove` stands in for `on delete cascade`.
  athletes.ownedBy(exercises, templates, routines, sessions, bodyWeight);

  return {
    athletes,
    bodyWeight,
    equipment: new InMemoryEquipmentRepository(),
    exercises,
    routines,
    templates,
    sessions,
    unitOfWork: new InMemoryUnitOfWork(),
  };
}

describe('in-memory adapters', () => {
  describeRepositoryContract({ name: 'in-memory', reset: async () => build() });
});
