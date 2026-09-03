import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";
import { currentTransaction } from "./transaction.server";

type Db = ReturnType<typeof drizzle<typeof schema>>;

let client: Db | undefined;

// Deferred past module load, not just past connecting: React Router's dev
// server imports every route module up front to build its route manifest,
// regardless of which URL was actually requested, so throwing here at
// import time would take down routes that never touch `db` at all. This
// throws only once something actually calls into `db` - by then, whichever
// route triggered it is the one that legitimately needs DATABASE_URL.
function getClient(): Db {
  if (!client) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("DATABASE_URL environment variable is not set");
    }
    client = drizzle(postgres(connectionString), { schema });
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
