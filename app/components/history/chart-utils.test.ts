import { describe, expect, it } from 'vitest';

import { formatMetricValue, paddedAxis } from './chart-utils';

describe('formatMetricValue', () => {
  it('rounds pounds to whole numbers, since half a pound is noise', () => {
    expect(formatMetricValue(182.4, 'lb')).toBe('182');
    expect(formatMetricValue(182.6, 'lb')).toBe('183');
  });

  it('keeps one decimal for everything else', () => {
    expect(formatMetricValue(82.44, 'kg')).toBe('82.4');
    expect(formatMetricValue(12.35, 'min')).toBe('12.4');
    expect(formatMetricValue(8, 'reps')).toBe('8');
  });

  it('groups thousands', () => {
    expect(formatMetricValue(12500, 'lb')).toBe((12500).toLocaleString());
  });
});

describe('paddedAxis', () => {
  it('leaves headroom above and below, so a plateau does not read as a cliff', () => {
    const { domain } = paddedAxis(180, 190);

    expect(domain[0]).toBeLessThan(180);
    expect(domain[1]).toBeGreaterThan(190);
  });

  it('lands its ticks on round numbers', () => {
    const { ticks } = paddedAxis(178, 198);

    for (const tick of ticks) {
      expect(Number.isInteger(tick / (ticks[1]! - ticks[0]!))).toBe(true);
    }
  });

  it('states both endpoints as ticks, which is what stops Recharts re-nicing them', () => {
    const { domain, ticks } = paddedAxis(178, 198);

    expect(ticks[0]).toBe(domain[0]);
    expect(ticks.at(-1)).toBe(domain[1]);
  });

  it('produces roughly the number of ticks asked for', () => {
    const { ticks } = paddedAxis(0, 100, 4);

    expect(ticks.length).toBeGreaterThanOrEqual(3);
    expect(ticks.length).toBeLessThanOrEqual(8);
  });

  /** No measurement here goes negative, and an axis that dips below zero invites reading a bar as shorter than it is. */
  it('never dips below zero', () => {
    expect(paddedAxis(1, 3).domain[0]).toBeGreaterThanOrEqual(0);
    expect(paddedAxis(0, 5).domain[0]).toBe(0);
  });

  it('still gives a flat series somewhere to sit', () => {
    const { domain, ticks } = paddedAxis(180, 180);

    expect(domain[1]).toBeGreaterThan(domain[0]);
    expect(ticks.length).toBeGreaterThan(1);
  });

  it('handles an all-zero series without dividing by zero', () => {
    const { domain, ticks } = paddedAxis(0, 0);

    expect(domain[1]).toBeGreaterThan(domain[0]);
    expect(ticks.every(Number.isFinite)).toBe(true);
  });

  it('scales its step with the data, not with a fixed increment', () => {
    const small = paddedAxis(0, 10);
    const large = paddedAxis(0, 100_000);

    expect(large.ticks[1]! - large.ticks[0]!).toBeGreaterThan(small.ticks[1]! - small.ticks[0]!);
  });
});
