/**
 * Routine slots and template exercises are both ordered lists persisted as a
 * `position` column under a `(parentId, position)` unique constraint, and
 * both need the same three operations: append at the end, remove and close
 * the gap, swap with a neighbour.
 *
 * Positions are always a contiguous `0..n-1` after any mutation, which is
 * the invariant the rest of the app assumes when it does cycle math on slot
 * count or renders "exercise 3 of 5".
 */

export interface Positioned {
  readonly id: string;
  position: number;
}

export type MoveDirection = "up" | "down";

export class OrderedChildren<T extends Positioned> {
  private readonly children: T[];

  constructor(items: readonly T[]) {
    this.children = [...items].sort((a, b) => a.position - b.position);
    this.renumber();
  }

  /** In position order. Callers must not mutate the array. */
  get items(): readonly T[] {
    return this.children;
  }

  get size(): number {
    return this.children.length;
  }

  get isEmpty(): boolean {
    return this.children.length === 0;
  }

  at(index: number): T | undefined {
    return this.children[index];
  }

  find(id: string): T | undefined {
    return this.children.find((child) => child.id === id);
  }

  indexOf(id: string): number {
    return this.children.findIndex((child) => child.id === id);
  }

  append(child: T): void {
    this.children.push(child);
    this.renumber();
  }

  /** Returns false if no child has that id, so a caller can report a no-op. */
  remove(id: string): boolean {
    const index = this.indexOf(id);
    if (index === -1) return false;
    this.children.splice(index, 1);
    this.renumber();
    return true;
  }

  /**
   * Swaps a child with its neighbour. Returns false at either end (moving
   * the first item up, the last down) and for an unknown id - both are
   * no-ops rather than errors, matching how the UI's arrow buttons behave
   * when a page is stale.
   */
  move(id: string, direction: MoveDirection): boolean {
    const index = this.indexOf(id);
    if (index === -1) return false;

    const target = direction === "up" ? index - 1 : index + 1;
    if (target < 0 || target >= this.children.length) return false;

    [this.children[index], this.children[target]] = [
      this.children[target],
      this.children[index],
    ];
    this.renumber();
    return true;
  }

  map<R>(fn: (child: T, index: number) => R): R[] {
    return this.children.map(fn);
  }

  private renumber(): void {
    this.children.forEach((child, index) => {
      child.position = index;
    });
  }
}
