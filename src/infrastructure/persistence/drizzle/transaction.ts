import { AsyncLocalStorage } from 'node:async_hooks';

// Type-only: `verbatimModuleSyntax` keeps `import { type X }` as a runtime
// import, which would make this and ./index a cycle.
import type { Transaction } from './index';

/**
 * Carries the open transaction for the current request.
 *
 * A repository's `save(aggregate)` writes a root row and its children, and
 * some use cases save two aggregates together (activating a plan stands
 * the previous one down). All of that has to be one transaction, but
 * threading a `tx` handle through `save` would put Drizzle's type in the
 * port and force every caller to know whether it was inside one.
 *
 * Instead the transaction is ambient: `UnitOfWork.run` puts it here, and
 * `dbScope` in ./index picks it up. AsyncLocalStorage is the right
 * tool because a request's async work stays inside its own store even while
 * other requests interleave.
 */
const storage = new AsyncLocalStorage<Transaction>();

export function currentTransaction(): Transaction | undefined {
  return storage.getStore();
}

export function runInTransaction<T>(tx: Transaction, work: () => Promise<T>): Promise<T> {
  return storage.run(tx, work);
}
