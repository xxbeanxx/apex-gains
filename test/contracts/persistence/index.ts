import { describeAdminActionsContract } from './admin-actions.contract';
import { describeExercisesContract } from './exercises.contract';
import { describeForkableLibraryContract } from './forkable-library.contract';
import type { ContractSubject } from './harness';
import {
  describeAthletesContract,
  describeBodyMeasurementsContract,
  describeBodyWeightContract,
  describeEquipmentContract,
  describeUnitOfWorkContract,
} from './misc.contract';
import { describePlansContract } from './plans.contract';
import { describeWorkoutsContract } from './workouts.contract';
import { describeSessionsContract } from './sessions.contract';

/**
 * What every repository adapter has to do, stated once.
 *
 * Ports are interfaces, so the compiler only checks an adapter's shape;
 * whether the in-memory store and Postgres answer the *same* question the
 * same way is a promise nothing else holds them to. That matters more here
 * than usual, because every service test suite is built on the in-memory
 * adapters - without this, they are simultaneously the code under test and
 * the oracle it is tested against.
 *
 * `contract/in-memory.test.ts` runs this in the ordinary unit suite.
 * `contract/drizzle.test.ts` runs the same suite against a real Postgres when
 * `TEST_DATABASE_URL` names one, and skips otherwise - see README.md's
 * "Repository contract tests".
 */
export function describeRepositoryContract(subject: ContractSubject): void {
  describeAdminActionsContract(subject);
  describeAthletesContract(subject);
  describeForkableLibraryContract(subject);
  describeExercisesContract(subject);
  describeWorkoutsContract(subject);
  describePlansContract(subject);
  describeSessionsContract(subject);
  describeEquipmentContract(subject);
  describeBodyWeightContract(subject);
  describeBodyMeasurementsContract(subject);
  describeUnitOfWorkContract(subject);
}

export type { ContractSubject, RepositorySet } from './harness';
