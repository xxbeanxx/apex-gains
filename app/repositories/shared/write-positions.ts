/**
 * Writes a reordered set of positions without tripping the
 * `(parentId, position)` unique constraint.
 *
 * Postgres checks a plain unique constraint per statement, so swapping two
 * neighbours by updating one row at a time collides on the intermediate
 * state. Every row whose position actually changed is parked at a distinct
 * negative scratch value first, then written to its final position.
 * Negatives can't collide with the real 0..n-1 range or with each other, so
 * any permutation is safe - including the one a removal produces, where
 * several rows shift down at once.
 *
 * Rows that didn't move are skipped, so an edit that only renames something
 * issues no position writes at all.
 */
export async function writePositions(
  previousPositions: ReadonlyMap<string, number>,
  next: readonly { id: string; position: number }[],
  update: (id: string, position: number) => Promise<unknown>,
): Promise<void> {
  const moved = next.filter(
    (child) => previousPositions.get(child.id) !== child.position,
  );
  if (moved.length === 0) return;

  // Park first, in one pass, so no final write can land on a position a
  // not-yet-moved row still holds.
  for (const [index, child] of moved.entries()) {
    await update(child.id, -1 - index);
  }
  for (const child of moved) {
    await update(child.id, child.position);
  }
}
