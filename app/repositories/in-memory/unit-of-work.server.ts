import type { UnitOfWork } from '../unit-of-work.server';

/**
 * Runs the work directly.
 *
 * The in-memory adapters are a single-threaded dev convenience with no
 * concurrent writers, so there is no isolation to provide. Atomicity is a
 * real gap though: work that throws part-way leaves the maps as it found
 * them mid-change. That is accepted for a store whose whole contents vanish
 * with the process - see equipment-repository.server.ts for when this
 * adapter is selected at all.
 */
export class InMemoryUnitOfWork implements UnitOfWork {
  async run<T>(work: () => Promise<T>): Promise<T> {
    return work();
  }
}
