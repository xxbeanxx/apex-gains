import { and, eq, isNotNull, isNull, notInArray, or, type SQL } from 'drizzle-orm';
import type { PgColumn, PgTable } from 'drizzle-orm/pg-core';

import { db } from '~/db/index.server';
import type { LibraryVisibility } from '~/domain/shared/ownership';

/**
 * The columns a visibility clause reads, named rather than inferred from the
 * table so `exercises`, `templates` and `routines` can share one builder
 * despite having nothing else in common.
 */
type OwnedColumns = {
  id: PgColumn;
  userId: PgColumn;
};

type ForkableColumns = OwnedColumns & {
  table: PgTable;
  forkedFromId: PgColumn;
};

/**
 * `LibraryVisibility.selectFrom` as a `where` clause.
 *
 * The subquery deliberately runs against `db` rather than `dbScope`: it asks
 * which samples this user has already forked, and that question is about
 * committed state. Reading it through the ambient transaction would let a
 * fork created earlier in the same unit of work hide the sample it came from
 * before the work is known to succeed.
 */
export function visibleRowsWhere(columns: ForkableColumns, visibility: LibraryVisibility): SQL {
  const own = eq(columns.userId, visibility.userId);
  if (!visibility.includesSamples) return own;

  const forkedSampleIds = db
    .select({ id: columns.forkedFromId })
    .from(columns.table)
    .where(and(eq(columns.userId, visibility.userId), isNotNull(columns.forkedFromId)));

  return or(own, and(isNull(columns.userId), notInArray(columns.id, forkedSampleIds)))!;
}

/**
 * `Ownership.isVisibleTo` as a `where` clause: own rows plus every sample.
 *
 * Fetching one row by id ignores forks - a fork only decides whether the
 * sample it came from is *listed*, not whether it can be reached - so this is
 * also the clause a by-id lookup narrows.
 */
export function ownOrSampleWhere(columns: OwnedColumns, userId: string): SQL {
  return or(eq(columns.userId, userId), isNull(columns.userId))!;
}

/** One row, if this user may reach it at all. */
export function visibleRowWhere(columns: OwnedColumns, userId: string, rowId: string): SQL {
  return and(eq(columns.id, rowId), ownOrSampleWhere(columns, userId))!;
}
