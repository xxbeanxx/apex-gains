import { describe, expect, it } from "vitest";

import { db } from "~/db/index.server";
import { equipment, exercises, routines, templates } from "~/db/schema";

import {
  sampleOrOwnEquipmentWhere,
  sampleOrOwnExercisesWhere,
  sampleOrOwnRoutinesWhere,
  sampleOrOwnTemplatesWhere,
} from "./sample-data.server";

/**
 * These functions return raw `SQL` fragments, so we can't inspect them
 * without wrapping them in a query. `db` never opens a connection here -
 * postgres-js and drizzle build the client lazily - so `.toSQL()` is a pure
 * syntax-tree-to-string conversion with no network I/O.
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

describe("sampleOrOwnEquipmentWhere", () => {
  it("scopes to only the user's own rows when sample data is hidden", () => {
    const { sql, params } = db
      .select()
      .from(equipment)
      .where(sampleOrOwnEquipmentWhere("user-1", false))
      .toSQL();

    expect(sql).toBe('select "id", "user_id", "name", "created_at" from "equipment" where "equipment"."user_id" = $1');
    expect(params).toEqual(["user-1"]);
  });

  it("includes all sample (userless) rows when sample data is shown", () => {
    const { sql, params } = db
      .select()
      .from(equipment)
      .where(sampleOrOwnEquipmentWhere("user-1", true))
      .toSQL();

    expect(sql).toContain('"equipment"."user_id" = $1');
    expect(sql).toContain('"equipment"."user_id" is null');
    // Unlike exercises/templates/routines, equipment has no fork tracking -
    // every sample row is shown regardless of what the user has forked.
    expect(sql).not.toContain("not in");
    expect(params).toEqual(["user-1"]);
  });
});

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
