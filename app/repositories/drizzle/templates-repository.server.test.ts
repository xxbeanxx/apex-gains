import { describe, expect, it } from "vitest";

import { db } from "~/db/index.server";
import { templates } from "~/db/schema";

import { sampleOrOwnTemplatesWhere } from "./templates-repository.server";

/**
 * sampleOrOwnTemplatesWhere returns a raw `SQL` fragment, so we can't
 * inspect it without wrapping it in a query. `db` never opens a connection
 * here - postgres-js and drizzle build the client lazily - so `.toSQL()` is
 * a pure syntax-tree-to-string conversion with no network I/O.
 */
describe("sampleOrOwnTemplatesWhere", () => {
  it("hides a sample template once the user has forked it", () => {
    const { sql, params } = db
      .select()
      .from(templates)
      .where(sampleOrOwnTemplatesWhere("user-1", true))
      .toSQL();

    expect(sql).toContain('"templates"."user_id" is null');
    expect(sql).toContain('"templates"."id" not in');
    expect(params).toEqual(["user-1", "user-1"]);
  });
});
