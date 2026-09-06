import { describe, expect, it } from 'vitest';

import { BodyMeasurement } from '~domain/body/body-measurement';
import { fixedClock } from '~domain/shared/clock';
import { sequentialIds } from '~domain/shared/ids';
import { DateOnly } from '~domain/values/date-only';
import { Length } from '~domain/values/length';

const NOW = new Date('2026-09-03T12:00:00Z');
const deps = { ids: sequentialIds('entry'), clock: fixedClock(NOW) };

describe('record', () => {
  it('mints an id and stamps createdAt from deps', () => {
    const entry = BodyMeasurement.record('user-1', DateOnly.parse('2026-09-03'), 'waist', Length.in(34), deps);

    expect(entry.id).toBe('entry-1');
    expect(entry.userId).toBe('user-1');
    expect(entry.date.value).toBe('2026-09-03');
    expect(entry.metric).toBe('waist');
    expect(entry.value.inInches).toBeCloseTo(34, 5);
    expect(entry.createdAt).toEqual(NOW);
  });
});

describe('snapshot round-trip', () => {
  it('restores the same state via fromSnapshot/toSnapshot', () => {
    const original = BodyMeasurement.record('user-1', DateOnly.parse('2026-09-03'), 'chest', Length.cm(102), deps);
    const restored = BodyMeasurement.fromSnapshot(original.toSnapshot());

    expect(restored.toSnapshot()).toEqual(original.toSnapshot());
  });
});

describe('correctTo', () => {
  it('replaces the recorded value', () => {
    const entry = BodyMeasurement.record('user-1', DateOnly.parse('2026-09-03'), 'thigh', Length.cm(60), deps);
    entry.correctTo(Length.cm(59));

    expect(entry.value.inCentimetres).toBe(59);
  });
});

describe('isOwnedBy', () => {
  it('is true for the recording user and false otherwise', () => {
    const entry = BodyMeasurement.record('user-1', DateOnly.parse('2026-09-03'), 'neck', Length.cm(40), deps);

    expect(entry.isOwnedBy('user-1')).toBe(true);
    expect(entry.isOwnedBy('user-2')).toBe(false);
  });
});
