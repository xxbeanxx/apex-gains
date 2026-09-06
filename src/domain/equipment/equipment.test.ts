import { describe, expect, it } from 'vitest';

import { Equipment } from '~domain/equipment/equipment';
import { fixedClock } from '~domain/shared/clock';
import { sequentialIds } from '~domain/shared/ids';

const NOW = new Date('2026-09-03T12:00:00Z');
const deps = { ids: sequentialIds('equipment'), clock: fixedClock(NOW) };

describe('create', () => {
  it('mints an id and stamps createdAt from the given deps', () => {
    const equipment = Equipment.create('user-1', 'Rowing machine', 'resistance', deps);

    expect(equipment.id).toBe('equipment-1');
    expect(equipment.ownership.isOwnedBy('user-1')).toBe(true);
    expect(equipment.name).toBe('Rowing machine');
    expect(equipment.cardioKind).toBe('resistance');
    expect(equipment.createdAt).toEqual(NOW);
  });

  it('allows a null cardioKind for non-cardio-specific equipment', () => {
    const equipment = Equipment.create('user-1', 'Barbell', null, deps);
    expect(equipment.cardioKind).toBeNull();
  });
});

describe('snapshot round-trip', () => {
  it('restores the same state via fromSnapshot/toSnapshot', () => {
    const original = Equipment.create('user-1', 'Treadmill', 'speed', deps);
    const restored = Equipment.fromSnapshot(original.toSnapshot());

    expect(restored.toSnapshot()).toEqual(original.toSnapshot());
  });

  it('reads a null userId as sample ownership', () => {
    const equipment = Equipment.fromSnapshot({
      id: 'sample-1',
      userId: null,
      name: 'BowFlex PR1000',
      cardioKind: null,
      createdAt: NOW,
    });

    expect(equipment.ownership.isSample).toBe(true);
  });
});

describe('rename and setCardioKind', () => {
  it('updates the name in place', () => {
    const equipment = Equipment.create('user-1', 'Treadmill', 'speed', deps);
    equipment.rename('Treadmill Pro');
    expect(equipment.name).toBe('Treadmill Pro');
  });

  it('updates the cardio kind, including clearing it back to null', () => {
    const equipment = Equipment.create('user-1', 'Treadmill', 'speed', deps);

    equipment.setCardioKind('resistance');
    expect(equipment.cardioKind).toBe('resistance');

    equipment.setCardioKind(null);
    expect(equipment.cardioKind).toBeNull();
  });
});

describe('isRemovableBy', () => {
  it('is removable by its owner', () => {
    const equipment = Equipment.create('user-1', 'Treadmill', 'speed', deps);
    expect(equipment.isRemovableBy('user-1')).toBe(true);
  });

  it('is not removable by another user', () => {
    const equipment = Equipment.create('user-1', 'Treadmill', 'speed', deps);
    expect(equipment.isRemovableBy('user-2')).toBe(false);
  });

  it('is not removable by anyone when it is a shared sample', () => {
    const equipment = Equipment.fromSnapshot({
      id: 'sample-1',
      userId: null,
      name: 'BowFlex PR1000',
      cardioKind: null,
      createdAt: NOW,
    });

    expect(equipment.isRemovableBy('user-1')).toBe(false);
  });
});
