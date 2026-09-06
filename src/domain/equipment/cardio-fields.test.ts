import { describe, expect, it } from 'vitest';

import { cardioFieldsFor } from '~domain/equipment/cardio-fields';

const BOTH = { showSpeed: true, showResistance: true };

describe('cardioFieldsFor', () => {
  it('offers only speed when every linked machine reports speed', () => {
    expect(cardioFieldsFor(['speed'])).toEqual({ showSpeed: true, showResistance: false });
    expect(cardioFieldsFor(['speed', 'speed'])).toEqual({ showSpeed: true, showResistance: false });
  });

  it('offers only resistance when every linked machine reports resistance', () => {
    expect(cardioFieldsFor(['resistance'])).toEqual({ showSpeed: false, showResistance: true });
  });

  /**
   * Both, rather than a guess: hiding a field an athlete actually needs
   * loses the measurement, while showing a spare one costs nothing.
   */
  it('offers both when the equipment disagrees', () => {
    expect(cardioFieldsFor(['speed', 'resistance'])).toEqual(BOTH);
  });

  it('offers both when no equipment declares a kind', () => {
    expect(cardioFieldsFor([])).toEqual(BOTH);
    expect(cardioFieldsFor([null])).toEqual(BOTH);
    expect(cardioFieldsFor([null, null])).toEqual(BOTH);
  });

  it('ignores equipment with no kind alongside equipment that has one', () => {
    expect(cardioFieldsFor([null, 'speed'])).toEqual({ showSpeed: true, showResistance: false });
    expect(cardioFieldsFor(['resistance', null])).toEqual({ showSpeed: false, showResistance: true });
  });
});
