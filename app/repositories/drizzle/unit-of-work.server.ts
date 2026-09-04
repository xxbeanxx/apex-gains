import { db } from '~/db/index.server';
import { currentTransaction, runInTransaction } from '~/db/transaction.server';

import type { UnitOfWork } from '../unit-of-work.server';

export class DrizzleUnitOfWork implements UnitOfWork {
  /**
   * Opens a transaction and publishes it for `dbScope` to pick up, so
   * repositories inside `work` write through it without being handed a
   * handle.
   *
   * Nesting joins the transaction already in progress rather than opening a
   * savepoint: a service that composes two others should still be one
   * all-or-nothing unit, which is what a caller means by wrapping them.
   */
  async run<T>(work: () => Promise<T>): Promise<T> {
    if (currentTransaction()) return work();
    return db.transaction((tx) => runInTransaction(tx, work));
  }
}
