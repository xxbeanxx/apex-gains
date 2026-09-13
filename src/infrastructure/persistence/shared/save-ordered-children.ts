import { eq, inArray } from 'drizzle-orm';
import type { PgColumn, PgTable } from 'drizzle-orm/pg-core';
import { dbScope } from '~infrastructure/persistence/drizzle/index';
import { diffChildren } from '~infrastructure/persistence/shared/diff-children';
import { writePositions } from '~infrastructure/persistence/shared/write-positions';

/**
 * The columns a save needs to know about a child table, named rather than
 * inferred so tables with nothing else in common (`plan_slots`,
 * `workout_exercises`) can share this one sequence. `parentIdKey` is the
 * column's JS property name, needed because an inserted row is built from a
 * plain object rather than through the table's own column references.
 */
export type OrderedChildColumns = {
  table: PgTable;
  id: PgColumn;
  parentId: PgColumn;
  parentIdKey: string;
  position: PgColumn;
};

/**
 * Writes an aggregate's ordered child collection - a plan's slots, a
 * workout's exercises - as one unit.
 *
 * `save(aggregate)` gets the current state, not a change log, so the delta
 * against what is stored is reconstructed with `diffChildren`. The order
 * these steps run in is load-bearing: removals free their positions first,
 * everything retained is repositioned through `writePositions`'s negative
 * scratch values, and only then are new rows inserted at their final
 * positions. Any other order can transiently violate the
 * `(parentId, position)` unique constraint, which Postgres checks per
 * statement.
 *
 * `toRow` maps a child to its non-key columns only (never `id`, the parent
 * id, or `position`, which this function supplies itself) - the same
 * mapping serves both the update and the insert.
 *
 * Callers run this inside a `UnitOfWork`, so the intermediate states are
 * never visible to anyone else.
 */
export async function saveOrderedChildren<T extends { id: string; position: number }>(
  columns: OrderedChildColumns,
  parentId: string,
  next: readonly T[],
  toRow: (child: T) => Record<string, unknown>,
): Promise<void> {
  // `columns.id`/`columns.position` are typed as bare `PgColumn` so one
  // function can serve tables with nothing else in common - which erases the
  // string/number types `OrderedChildColumns`' callers guarantee.
  const existing = (await dbScope
    .select({ id: columns.id, position: columns.position })
    .from(columns.table)
    .where(eq(columns.parentId, parentId))) as { id: string; position: number }[];

  const diff = diffChildren(existing, next);

  if (diff.deletedIds.length > 0) {
    await dbScope.delete(columns.table).where(inArray(columns.id, diff.deletedIds));
  }

  for (const child of diff.updated) {
    await dbScope.update(columns.table).set(toRow(child)).where(eq(columns.id, child.id));
  }

  await writePositions(new Map(existing.map((row) => [row.id, row.position])), diff.updated, (id, position) =>
    dbScope.update(columns.table).set({ position }).where(eq(columns.id, id)),
  );

  if (diff.inserted.length > 0) {
    await dbScope.insert(columns.table).values(
      diff.inserted.map((child) => ({
        id: child.id,
        [columns.parentIdKey]: parentId,
        position: child.position,
        ...toRow(child),
      })),
    );
  }
}
