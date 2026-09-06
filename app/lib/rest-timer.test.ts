import { describe, expect, it } from 'vitest';

import { formatRemaining, remainingSeconds } from './rest-timer';

describe('remainingSeconds', () => {
  it('rounds up to the next whole second', () => {
    expect(remainingSeconds(10_000, 8_501)).toBe(2);
  });

  it('is zero exactly at the deadline', () => {
    expect(remainingSeconds(10_000, 10_000)).toBe(0);
  });

  it('floors at zero rather than going negative once the deadline has passed', () => {
    expect(remainingSeconds(10_000, 15_000)).toBe(0);
  });
});

describe('formatRemaining', () => {
  it('formats under a minute with a zero minutes place', () => {
    expect(formatRemaining(5)).toBe('0:05');
  });

  it('formats a minute and a half', () => {
    expect(formatRemaining(90)).toBe('1:30');
  });

  it('formats zero', () => {
    expect(formatRemaining(0)).toBe('0:00');
  });
});
