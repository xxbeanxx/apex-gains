import { describe, expect, it } from 'vitest';

import { OrderedChildren } from '~domain/shared/ordered';

type Child = { id: string; position: number };

function child(id: string, position: number): Child {
  return { id, position };
}

function positionsOf(children: OrderedChildren<Child>) {
  return children.items.map((item) => `${item.id}@${item.position}`);
}

describe('OrderedChildren', () => {
  it('sorts by position on construction', () => {
    const children = new OrderedChildren([child('c', 2), child('a', 0), child('b', 1)]);
    expect(positionsOf(children)).toEqual(['a@0', 'b@1', 'c@2']);
  });

  /**
   * Rows can arrive with gaps - an older removal that only deleted its row -
   * and the rest of the app assumes a contiguous 0..n-1 when it does cycle
   * arithmetic on the count.
   */
  it('closes gaps in the positions it is given', () => {
    const children = new OrderedChildren([child('a', 3), child('b', 9)]);
    expect(positionsOf(children)).toEqual(['a@0', 'b@1']);
  });

  it('appends at the end', () => {
    const children = new OrderedChildren([child('a', 0)]);
    children.append(child('b', 99));
    expect(positionsOf(children)).toEqual(['a@0', 'b@1']);
  });

  it('closes the gap after a removal', () => {
    const children = new OrderedChildren([child('a', 0), child('b', 1), child('c', 2)]);
    expect(children.remove('b')).toBe(true);
    expect(positionsOf(children)).toEqual(['a@0', 'c@1']);
  });

  it("reports removing something that isn't there", () => {
    const children = new OrderedChildren([child('a', 0)]);
    expect(children.remove('nope')).toBe(false);
    expect(positionsOf(children)).toEqual(['a@0']);
  });

  it('swaps with the previous neighbour', () => {
    const children = new OrderedChildren([child('a', 0), child('b', 1), child('c', 2)]);
    expect(children.move('c', 'up')).toBe(true);
    expect(positionsOf(children)).toEqual(['a@0', 'c@1', 'b@2']);
  });

  it('swaps with the next neighbour', () => {
    const children = new OrderedChildren([child('a', 0), child('b', 1)]);
    expect(children.move('a', 'down')).toBe(true);
    expect(positionsOf(children)).toEqual(['b@0', 'a@1']);
  });

  it.each([
    ['the first item up', 'a', 'up' as const],
    ['the last item down', 'b', 'down' as const],
  ])('reports moving %s as a no-op', (_label, id, direction) => {
    const children = new OrderedChildren([child('a', 0), child('b', 1)]);
    expect(children.move(id, direction)).toBe(false);
    expect(positionsOf(children)).toEqual(['a@0', 'b@1']);
  });

  it('reports moving an unknown child as a no-op', () => {
    const children = new OrderedChildren([child('a', 0)]);
    expect(children.move('nope', 'up')).toBe(false);
  });

  it('looks a child up by id and by index', () => {
    const children = new OrderedChildren([child('a', 0), child('b', 1)]);
    expect(children.find('b')?.id).toBe('b');
    expect(children.at(0)?.id).toBe('a');
    expect(children.at(1)?.id).toBe('b');
    expect(children.find('nope')).toBeUndefined();
  });
});
