import { describe, expect, it } from 'vitest';

import { LibraryVisibility } from '~domain/shared/ownership';
import { db } from '~infrastructure/persistence/drizzle/index';
import { equipment, exercises, plans, workouts } from '~infrastructure/persistence/drizzle/schema';

import { ownOrSampleWhere, visibleRowWhere, visibleRowsWhere } from './visibility';

/**
 * These builders return raw `SQL` fragments, so they can't be inspected
 * without wrapping them in a query. `db` never opens a connection here -
 * postgres-js and drizzle build the client lazily - so `.toSQL()` is a pure
 * syntax-tree-to-string conversion with no network I/O.
 */
const forkable = {
  exercises: { table: exercises, id: exercises.id, userId: exercises.userId, forkedFromId: exercises.forkedFromId },
  plans: { table: plans, id: plans.id, userId: plans.userId, forkedFromId: plans.forkedFromId },
  workouts: { table: workouts, id: workouts.id, userId: workouts.userId, forkedFromId: workouts.forkedFromId },
} as const;

describe('visibleRowsWhere', () => {
  // Every forkable library reads the same rule, so each one is asserted
  // against the same shape rather than trusting that one stands for three.
  for (const [name, columns] of Object.entries(forkable)) {
    describe(name, () => {
      it("scopes to only the user's own rows when sample data is hidden", () => {
        const { sql, params } = db
          .select()
          .from(columns.table)
          .where(visibleRowsWhere(columns, LibraryVisibility.for('user-1', false)))
          .toSQL();

        expect(sql).toContain(`"${name}"."user_id" = $1`);
        expect(sql).not.toContain('is null');
        expect(params).toEqual(['user-1']);
      });

      it('includes sample rows not yet forked by the user when sample data is shown', () => {
        const { sql, params } = db
          .select()
          .from(columns.table)
          .where(visibleRowsWhere(columns, LibraryVisibility.for('user-1', true)))
          .toSQL();

        expect(sql).toContain(`"${name}"."user_id" = $1`);
        expect(sql).toContain(`"${name}"."user_id" is null`);
        expect(sql).toContain(`"${name}"."id" not in`);
        expect(sql).toContain(`"${name}"."forked_from_id" is not null`);
        // The user id is bound twice: once for the outer own-rows check, once
        // inside the "already forked" subquery.
        expect(params).toEqual(['user-1', 'user-1']);
      });

      it('binds the user it was given', () => {
        const { params } = db
          .select()
          .from(columns.table)
          .where(visibleRowsWhere(columns, LibraryVisibility.for('user-2', true)))
          .toSQL();

        expect(params).toEqual(['user-2', 'user-2']);
      });
    });
  }
});

describe('ownOrSampleWhere', () => {
  it('matches own rows and every sample, forks included', () => {
    const { sql, params } = db
      .select()
      .from(equipment)
      .where(ownOrSampleWhere({ id: equipment.id, userId: equipment.userId }, 'user-1'))
      .toSQL();

    expect(sql).toContain('"equipment"."user_id" = $1');
    expect(sql).toContain('"equipment"."user_id" is null');
    expect(sql).not.toContain('not in');
    expect(params).toEqual(['user-1']);
  });
});

describe('visibleRowWhere', () => {
  it('narrows a by-id lookup to rows the user may reach', () => {
    const { sql, params } = db
      .select()
      .from(exercises)
      .where(visibleRowWhere({ id: exercises.id, userId: exercises.userId }, 'user-1', 'exercise-9'))
      .toSQL();

    expect(sql).toContain('"exercises"."id" = $1');
    expect(sql).toContain('"exercises"."user_id" = $2');
    expect(sql).toContain('"exercises"."user_id" is null');
    // A fork never hides the sample it came from from a direct fetch.
    expect(sql).not.toContain('not in');
    expect(params).toEqual(['exercise-9', 'user-1']);
  });
});
