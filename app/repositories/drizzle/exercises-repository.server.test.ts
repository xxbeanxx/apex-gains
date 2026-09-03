import { describe, expect, it } from "vitest";

import { db } from "~/db/index.server";
import { exercises } from "~/db/schema";

import { sampleOrOwnExercisesWhere } from "./exercises-repository.server";

/**
 * sampleOrOwnExercisesWhere returns a raw `SQL` fragment, so we can't
 * inspect it without wrapping it in a query. `db` never opens a connection
 * here - postgres-js and drizzle build the client lazily - so `.toSQL()` is
 * a pure syntax-tree-to-string conversion with no network I/O.
 */
describe("sampleOrOwnExercisesWhere", () => {
  it("scopes to only the user's own rows when sample data is hidden", () => {
    const { sql, params } = db
      .select()
      .from(exercises)
      .where(sampleOrOwnExercisesWhere("user-1", false))
      .toSQL();

    expect(sql).toContain('"exercises"."user_id" = $1');
    expect(sql).not.toContain("is null");
    expect(params).toEqual(["user-1"]);
  });

  it("includes sample rows not yet forked by the user when sample data is shown", () => {
    const { sql, params } = db
      .select()
      .from(exercises)
      .where(sampleOrOwnExercisesWhere("user-1", true))
      .toSQL();

    expect(sql).toContain('"exercises"."user_id" = $1');
    expect(sql).toContain('"exercises"."user_id" is null');
    expect(sql).toContain('"exercises"."id" not in');
    expect(sql).toContain('"exercises"."forked_from_id" is not null');
    // The subquery scopes forked-from lookups to the same user twice: once
    // for the outer own-rows check, once inside the "already forked" subquery.
    expect(params).toEqual(["user-1", "user-1"]);
  });
});
