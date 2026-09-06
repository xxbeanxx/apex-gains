import { describe, expect, it } from 'vitest';

import { fixedClock } from '../shared/clock';
import { sequentialIds } from '../shared/ids';
import { DateOnly } from '../values/date-only';
import { Weight } from '../values/weight';
import { BodyWeightEntry } from './body-weight-entry';

const NOW = new Date('2026-09-03T12:00:00Z');
const deps = { ids: sequentialIds('entry'), clock: fixedClock(NOW) };

describe('record', () => {
  it('mints an id and stamps createdAt from deps', () => {
    const entry = BodyWeightEntry.record('user-1', DateOnly.parse('2026-09-03'), Weight.lb(185), deps);

    expect(entry.id).toBe('entry-1');
    expect(entry.userId).toBe('user-1');
    expect(entry.date.value).toBe('2026-09-03');
    expect(entry.weight.inPounds).toBe(185);
    expect(entry.createdAt).toEqual(NOW);
  });
});

describe('snapshot round-trip', () => {
  it('restores the same state via fromSnapshot/toSnapshot', () => {
    const original = BodyWeightEntry.record('user-1', DateOnly.parse('2026-09-03'), Weight.lb(185), deps);
    const restored = BodyWeightEntry.fromSnapshot(original.toSnapshot());

    expect(restored.toSnapshot()).toEqual(original.toSnapshot());
  });
});

describe('correctTo', () => {
  it('replaces the recorded weight', () => {
    const entry = BodyWeightEntry.record('user-1', DateOnly.parse('2026-09-03'), Weight.lb(185), deps);
    entry.correctTo(Weight.lb(184));

    expect(entry.weight.inPounds).toBe(184);
  });
});

describe('isOwnedBy', () => {
  it('is true for the recording user and false otherwise', () => {
    const entry = BodyWeightEntry.record('user-1', DateOnly.parse('2026-09-03'), Weight.lb(185), deps);

    expect(entry.isOwnedBy('user-1')).toBe(true);
    expect(entry.isOwnedBy('user-2')).toBe(false);
  });
});
