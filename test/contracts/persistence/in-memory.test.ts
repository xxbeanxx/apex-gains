import { describe } from 'vitest';
import { inMemoryRepositories } from '~infrastructure/persistence/in-memory/repositories';

import { describeRepositoryContract } from './index';

/**
 * The in-memory family answering the same contract as Postgres.
 *
 * Every service test suite is built on these adapters, so this is what keeps
 * them from being their own oracle: a rule the in-memory store gets wrong is
 * a rule the service suites would happily confirm. It builds the family the
 * same way they do, so the wiring under test is the wiring they get.
 */
describe('in-memory adapters', () => {
  describeRepositoryContract({ name: 'in-memory', reset: async () => inMemoryRepositories() });
});
