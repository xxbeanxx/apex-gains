import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";

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
