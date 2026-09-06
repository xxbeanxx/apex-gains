import { describe, expect, it } from 'vitest';

import { nextCopyName } from '~application/shared/duplicate-name';

describe('nextCopyName', () => {
  it('appends "(copy)" when nothing collides', () => {
    expect(nextCopyName('Push Day', new Set())).toBe('Push Day (copy)');
  });

  it('numbers the next copy when "(copy)" is already taken', () => {
    expect(nextCopyName('Push Day', new Set(['Push Day (copy)']))).toBe('Push Day (copy 2)');
  });

  it('finds the first free number past a run of taken ones', () => {
    const existing = new Set(['Push Day (copy)', 'Push Day (copy 2)', 'Push Day (copy 3)']);
    expect(nextCopyName('Push Day', existing)).toBe('Push Day (copy 4)');
  });

  it('ignores an unrelated gap - it only ever counts up from the lowest free slot', () => {
    const existing = new Set(['Push Day (copy)', 'Push Day (copy 3)']);
    expect(nextCopyName('Push Day', existing)).toBe('Push Day (copy 2)');
  });
});
