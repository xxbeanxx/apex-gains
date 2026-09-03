/**
 * Works out what to write for an aggregate's child collection.
 *
 * `save(aggregate)` gets the aggregate's *current* state, not a change log,
 * so the adapter has to reconstruct the delta. Deleting every child and
 * re-inserting would be simpler, but it would churn child ids on every save
 * and write far more rows than changed - so the child rows are matched by id
 * against what was loaded.
 *
 * Retained children are all reported as updated rather than compared field
 * by field: these collections hold at most a couple of dozen rows, and a
 * comparator would be one more thing to keep in step with the snapshot's
 * shape. Position writes are the exception, because they collide with a
 * unique constraint - see ./write-positions.
 */
export type ChildDiff<T> = {
  readonly inserted: T[];
  readonly updated: T[];
  readonly deletedIds: string[];
};

/**
 * `previous` only has to supply ids, so an adapter that needs nothing else
 * from the old rows can select just the id column.
 */
export function diffChildren<T extends { id: string }>(
  previous: readonly { id: string }[],
  next: readonly T[],
): ChildDiff<T> {
  const previousIds = new Set(previous.map((child) => child.id));
  const nextIds = new Set(next.map((child) => child.id));

  return {
    inserted: next.filter((child) => !previousIds.has(child.id)),
    updated: next.filter((child) => previousIds.has(child.id)),
    deletedIds: previous
      .filter((child) => !nextIds.has(child.id))
      .map((child) => child.id),
  };
}
