import { describe, expect, it } from 'vitest';

import { formatNumber, speedUnitLabel } from './units';

describe('speedUnitLabel', () => {
  it('labels km as km/h', () => {
    expect(speedUnitLabel('km')).toBe('km/h');
  });

  it('labels mi as mph, not "mi/h"', () => {
    expect(speedUnitLabel('mi')).toBe('mph');
  });
});

describe('formatNumber', () => {
  it('drops trailing zeros for a whole number', () => {
    expect(formatNumber(135)).toBe('135');
  });

  it('rounds to the given number of decimals', () => {
    expect(formatNumber(61.249, 1)).toBe('61.2');
  });

  it('defaults to at most one decimal place', () => {
    expect(formatNumber(8.567)).toBe('8.6');
  });

  it('drops trailing zeros after rounding', () => {
    expect(formatNumber(8.0, 2)).toBe('8');
  });

  it('supports a larger decimal budget', () => {
    expect(formatNumber(1.2345, 3)).toBe('1.234');
  });
});
