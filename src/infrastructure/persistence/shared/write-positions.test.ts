import { describe, expect, it } from 'vitest';

import { writePositions } from '~infrastructure/persistence/shared/write-positions';

/**
 * Replays the writes against a stand-in for the `(parentId, position)`
 * unique constraint, so a sequence that would collide in Postgres fails
 * here too rather than only in production.
 */
function applyTo(initial: Record<string, number>) {
  const rows = new Map(Object.entries(initial));
  const collisions: string[] = [];

  const update = async (id: string, position: number) => {
    for (const [otherId, otherPosition] of rows) {
      if (otherId !== id && otherPosition === position) {
        collisions.push(`${id} -> ${position} collides with ${otherId}`);
      }
    }
    rows.set(id, position);
  };

  return { rows, collisions, update };
}

describe('writePositions', () => {
  it('writes nothing when nothing moved', async () => {
    const writes: string[] = [];
    await writePositions(
      new Map([
        ['a', 0],
        ['b', 1],
      ]),
      [
        { id: 'a', position: 0 },
        { id: 'b', position: 1 },
      ],
      async (id, position) => writes.push(`${id}@${position}`),
    );

    expect(writes).toEqual([]);
  });

  it('swaps two neighbours without colliding', async () => {
    const { rows, collisions, update } = applyTo({ a: 0, b: 1 });

    await writePositions(
      new Map([
        ['a', 0],
        ['b', 1],
      ]),
      [
        { id: 'b', position: 0 },
        { id: 'a', position: 1 },
      ],
      update,
    );

    expect(collisions).toEqual([]);
    expect(Object.fromEntries(rows)).toEqual({ a: 1, b: 0 });
  });

  /**
   * The scratch pass has to park *every* moving row before any final write,
   * or a shift-down - which the old hardcoded single `-1` couldn't express -
   * lands on a position its neighbour still holds.
   */
  it('shifts a run of rows down without colliding', async () => {
    const { rows, collisions, update } = applyTo({ b: 1, c: 2, d: 3 });

    await writePositions(
      new Map([
        ['b', 1],
        ['c', 2],
        ['d', 3],
      ]),
      [
        { id: 'b', position: 0 },
        { id: 'c', position: 1 },
        { id: 'd', position: 2 },
      ],
      update,
    );

    expect(collisions).toEqual([]);
    expect(Object.fromEntries(rows)).toEqual({ b: 0, c: 1, d: 2 });
  });

  it('applies an arbitrary permutation without colliding', async () => {
    const { rows, collisions, update } = applyTo({ a: 0, b: 1, c: 2, d: 3 });

    await writePositions(
      new Map([
        ['a', 0],
        ['b', 1],
        ['c', 2],
        ['d', 3],
      ]),
      [
        { id: 'd', position: 0 },
        { id: 'a', position: 1 },
        { id: 'b', position: 2 },
        { id: 'c', position: 3 },
      ],
      update,
    );

    expect(collisions).toEqual([]);
    expect(Object.fromEntries(rows)).toEqual({ a: 1, b: 2, c: 3, d: 0 });
  });

  it('leaves untouched rows out of the writes entirely', async () => {
    const writes: string[] = [];
    await writePositions(
      new Map([
        ['a', 0],
        ['b', 1],
        ['c', 2],
      ]),
      [
        { id: 'a', position: 0 },
        { id: 'c', position: 1 },
        { id: 'b', position: 2 },
      ],
      async (id, position) => writes.push(`${id}@${position}`),
    );

    expect(writes.some((write) => write.startsWith('a@'))).toBe(false);
  });
});
