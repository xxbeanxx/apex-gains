import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import * as schema from './schema';
import { currentTransaction } from './transaction.server';

type Db = ReturnType<typeof drizzle<typeof schema>>;

let client: Db | undefined;
let connectionString: string | undefined;

/**
 * Supplies the connection string, once, from config the server has already
 * validated (`server/repositories/repositories.module.ts` calls this with
 * `databaseConfig.databaseUrl`).
 *
 * Without it this module would have to read `process.env` itself, which
 * would put a second, unvalidated reader on the one variable the config
 * layer is supposed to own. Standalone entry points that never boot Nest -
 * `app/db/seed.ts`, drizzle-kit - fall back to the environment below.
 */
export function configureDatabase(url: string): void {
  connectionString = url;
}

// Connecting is deferred past module load, not just past first use: React
// Router's dev server imports every route module up front to build its route
// manifest, regardless of which URL was requested, so throwing here at import
// time would take down routes that never touch `db` at all. This throws only
// once something actually calls into `db` - by then, whichever route
// triggered it is the one that legitimately needs a database.
function getClient(): Db {
  if (!client) {
    const url = connectionString ?? process.env.DATABASE_URL;
    if (!url) {
      throw new Error(
        'No database connection configured - set DATABASE_URL, or call ' + 'configureDatabase() during server bootstrap.',
      );
    }
    client = drizzle(postgres(url), { schema });
  }
  return client;
}

export const db: Db = new Proxy({} as Db, {
  get(_target, prop, receiver) {
    return Reflect.get(getClient(), prop, receiver);
  },
});

export type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * What repository adapters should query through: the transaction open for
 * this request if there is one, otherwise the connection itself.
 *
 * Using `db` directly inside a `UnitOfWork.run` would issue the statement on
 * a different connection and quietly escape the transaction, so adapters use
 * this instead - the one exception being a query that must deliberately see
 * committed state.
 *
 * A `Transaction` and the database expose the same query builders (both are
 * a Drizzle `PgDatabase`); the cast only covers connection-level extras that
 * adapters never touch.
 */
export const dbScope: Db = new Proxy({} as Db, {
  get(_target, prop, receiver) {
    const scope = currentTransaction() ?? getClient();
    return Reflect.get(scope, prop, receiver);
  },
});
