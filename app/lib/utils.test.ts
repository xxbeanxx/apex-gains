import { describe, expect, it } from 'vitest';

import { cn } from '~/lib/utils';

describe('cn', () => {
  it('joins plain class names', () => {
    expect(cn('a', 'b')).toBe('a b');
  });

  it('drops falsy values', () => {
    expect(cn('a', false, null, undefined, 'b')).toBe('a b');
  });

  it('merges conflicting Tailwind utilities, keeping the last one', () => {
    expect(cn('px-2', 'px-4')).toBe('px-4');
  });

  it('supports conditional object syntax', () => {
    expect(cn({ a: true, b: false })).toBe('a');
  });
});
