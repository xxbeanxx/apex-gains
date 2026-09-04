import { describe, expect, it } from 'vitest';

import { diffChildren } from './diff-children';

describe('diffChildren', () => {
  it('reports a child that is new', () => {
    const diff = diffChildren([{ id: 'a' }], [{ id: 'a' }, { id: 'b' }]);

    expect(diff.inserted.map((c) => c.id)).toEqual(['b']);
    expect(diff.updated.map((c) => c.id)).toEqual(['a']);
    expect(diff.deletedIds).toEqual([]);
  });

  it('reports a child that is gone', () => {
    const diff = diffChildren([{ id: 'a' }, { id: 'b' }], [{ id: 'a' }]);

    expect(diff.inserted).toEqual([]);
    expect(diff.deletedIds).toEqual(['b']);
  });

  it('treats a replaced child as both an insert and a delete', () => {
    const diff = diffChildren([{ id: 'a' }], [{ id: 'b' }]);

    expect(diff.inserted.map((c) => c.id)).toEqual(['b']);
    expect(diff.deletedIds).toEqual(['a']);
    expect(diff.updated).toEqual([]);
  });

  it('treats every child of a brand-new aggregate as an insert', () => {
    const diff = diffChildren([], [{ id: 'a' }, { id: 'b' }]);

    expect(diff.inserted.map((c) => c.id)).toEqual(['a', 'b']);
    expect(diff.deletedIds).toEqual([]);
  });

  it('carries the full child through, not just its id', () => {
    const diff = diffChildren<{ id: string; position: number }>([], [{ id: 'a', position: 3 }]);

    expect(diff.inserted[0].position).toBe(3);
  });
});
