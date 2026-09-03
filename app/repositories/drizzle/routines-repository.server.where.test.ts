import { describe, expect, it } from "vitest";

import { db } from "~/db/index.server";
import { routines } from "~/db/schema";

import { sampleOrOwnRoutinesWhere } from "./routines-repository.server";

/**
 * sampleOrOwnRoutinesWhere returns a raw `SQL` fragment, so we can't
 * inspect it without wrapping it in a query. `db` never opens a connection
 * here - postgres-js and drizzle build the client lazily - so `.toSQL()` is
 * a pure syntax-tree-to-string conversion with no network I/O.
 */
describe("sampleOrOwnRoutinesWhere", () => {
  it("hides a sample routine once the user has forked it", () => {
    const { sql, params } = db
      .select()
      .from(routines)
      .where(sampleOrOwnRoutinesWhere("user-1", true))
      .toSQL();

    expect(sql).toContain('"routines"."user_id" is null');
    expect(sql).toContain('"routines"."id" not in');
    expect(params).toEqual(["user-1", "user-1"]);
  });

  it("is scoped to the requesting user, not any user with a fork", () => {
    const { params } = db
      .select()
      .from(routines)
      .where(sampleOrOwnRoutinesWhere("user-2", true))
      .toSQL();

    expect(params).toEqual(["user-2", "user-2"]);
  });
});
