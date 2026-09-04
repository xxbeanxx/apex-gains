import { describe, expect, it } from 'vitest';

import { db } from '~/db/index.server';
import { equipment } from '~/db/schema';

import { sampleOrOwnEquipmentWhere } from './equipment-repository.server';

/**
 * sampleOrOwnEquipmentWhere returns a raw `SQL` fragment, so we can't
 * inspect it without wrapping it in a query. `db` never opens a connection
 * here - postgres-js and drizzle build the client lazily - so `.toSQL()` is
 * a pure syntax-tree-to-string conversion with no network I/O.
 */
describe('sampleOrOwnEquipmentWhere', () => {
  it("scopes to only the user's own rows when sample data is hidden", () => {
    const { sql, params } = db.select().from(equipment).where(sampleOrOwnEquipmentWhere('user-1', false)).toSQL();

    expect(sql).toBe('select "id", "user_id", "name", "created_at" from "equipment" where "equipment"."user_id" = $1');
    expect(params).toEqual(['user-1']);
  });

  it('includes all sample (userless) rows when sample data is shown', () => {
    const { sql, params } = db.select().from(equipment).where(sampleOrOwnEquipmentWhere('user-1', true)).toSQL();

    expect(sql).toContain('"equipment"."user_id" = $1');
    expect(sql).toContain('"equipment"."user_id" is null');
    // Unlike exercises/templates/routines, equipment has no fork tracking -
    // every sample row is shown regardless of what the user has forked.
    expect(sql).not.toContain('not in');
    expect(params).toEqual(['user-1']);
  });
});
