import { describe, expect, it } from 'vitest';

import { fixedClock } from '../shared/clock';
import { sequentialIds } from '../shared/ids';
import { DateOnly } from '../values/date-only';
import { Routine, type RoutineSnapshot } from './routine';

const NOW = new Date('2026-09-03T12:00:00Z');
const deps = () => ({ ids: sequentialIds('id'), clock: fixedClock(NOW) });

function snapshot(overrides: Partial<RoutineSnapshot> = {}): RoutineSnapshot {
  return {
    id: 'routine-1',
    userId: 'user-1',
    forkedFromId: null,
    name: 'Push/Pull/Legs',
    isActive: false,
    anchorDate: '2026-09-01',
    createdAt: NOW,
    updatedAt: NOW,
    slots: [],
    ...overrides,
  };
}

function withSlots(templateIds: (string | null)[], rest: Partial<RoutineSnapshot> = {}) {
  return Routine.fromSnapshot(
    snapshot({
      ...rest,
      slots: templateIds.map((templateId, position) => ({
        id: `slot-${position}`,
        position,
        templateId,
      })),
    }),
  );
}

describe('cycle scheduling', () => {
  const routine = withSlots(['push', 'pull', null]);

  it('puts the anchor date on the first slot', () => {
    expect(routine.slotOn(DateOnly.parse('2026-09-01'))?.templateId).toBe('push');
  });

  it('advances one slot per calendar day', () => {
    expect(routine.slotOn(DateOnly.parse('2026-09-02'))?.templateId).toBe('pull');
    expect(routine.slotOn(DateOnly.parse('2026-09-03'))?.isRestDay).toBe(true);
  });

  it('wraps around at the end of the cycle', () => {
    expect(routine.slotOn(DateOnly.parse('2026-09-04'))?.templateId).toBe('push');
  });

  /**
   * The cycle counts days, so a missed day is simply a day the athlete didn't
   * train - it does not pause and resume where they left off.
   */
  it('does not pause for missed days', () => {
    // Ten days on from the anchor: 10 mod 3 = 1.
    expect(routine.slotOn(DateOnly.parse('2026-09-11'))?.templateId).toBe('pull');
  });

  it('still answers for dates before the anchor', () => {
    // One day before the anchor is the last slot of the previous cycle.
    expect(routine.slotOn(DateOnly.parse('2026-08-31'))?.isRestDay).toBe(true);
    expect(routine.slotOn(DateOnly.parse('2026-08-30'))?.templateId).toBe('pull');
  });

  it('schedules nothing when it has no slots', () => {
    const empty = withSlots([]);
    expect(empty.slotIndexOn(DateOnly.parse('2026-09-03'))).toBeNull();
    expect(empty.slotOn(DateOnly.parse('2026-09-03'))).toBeNull();
  });

  it('re-anchoring shifts which slot a date lands on', () => {
    const shifted = withSlots(['push', 'pull', null]);
    shifted.reanchor(DateOnly.parse('2026-09-02'), NOW);
    expect(shifted.slotOn(DateOnly.parse('2026-09-02'))?.templateId).toBe('push');
  });
});

describe('slots', () => {
  it('appends a new slot at the end of the cycle', () => {
    const routine = withSlots(['push']);
    routine.addSlot('pull', deps());
    expect(routine.slots.map((s) => s.templateId)).toEqual(['push', 'pull']);
  });

  it('adds a rest day when given no template', () => {
    const routine = withSlots([]);
    const slot = routine.addSlot(null, deps());
    expect(slot.isRestDay).toBe(true);
  });

  it('closes the gap when a slot is removed', () => {
    const routine = withSlots(['push', 'pull', 'legs']);
    expect(routine.removeSlot('slot-1', NOW)).toBe(true);
    expect(routine.slots.map((s) => s.templateId)).toEqual(['push', 'legs']);
    expect(routine.slots.map((s) => s.position)).toEqual([0, 1]);
  });

  it('reorders by swapping with a neighbour', () => {
    const routine = withSlots(['push', 'pull', 'legs']);
    expect(routine.moveSlot('slot-2', 'up', NOW)).toBe(true);
    expect(routine.slots.map((s) => s.templateId)).toEqual(['push', 'legs', 'pull']);
  });

  it('removing a slot shortens the cycle, changing what falls on a date', () => {
    const routine = withSlots(['push', 'pull', 'legs']);
    expect(routine.slotOn(DateOnly.parse('2026-09-04'))?.templateId).toBe('push');
    routine.removeSlot('slot-2', NOW);
    // Now a 2-day cycle: 3 days on from the anchor is an odd offset.
    expect(routine.slotOn(DateOnly.parse('2026-09-04'))?.templateId).toBe('pull');
  });
});

describe('fork on write', () => {
  it('returns the routine itself when the athlete already owns it', () => {
    const routine = withSlots(['push']);
    const copy = routine.editableCopyFor('user-1', deps());

    expect(copy.editable).toBe(routine);
    expect(copy.forkedId).toBeNull();
    expect(copy.translateChildId('slot-0')).toBe('slot-0');
  });

  it('copies a sample into a personal routine, leaving the sample alone', () => {
    const sample = withSlots(['push', null], { userId: null, id: 'sample-1' });
    const copy = sample.editableCopyFor('user-1', deps());

    expect(copy.forkedId).toBe(copy.editable.id);
    expect(copy.editable.ownership.isOwnedBy('user-1')).toBe(true);
    expect(copy.editable.forkedFromId).toBe('sample-1');
    expect(copy.editable.name).toBe(sample.name);
    expect(copy.editable.slots.map((s) => s.templateId)).toEqual(['push', null]);

    copy.editable.rename('My version', NOW);
    expect(sample.name).toBe('Push/Pull/Legs');
  });

  /**
   * The fork's slots are new rows with new ids, so a `slotId` that arrived on
   * a form - naming a slot of the *sample* - has to be mapped onto the copy
   * before the mutation can find it.
   */
  it("maps a sample's slot ids onto the fork's, by position", () => {
    const sample = withSlots(['push', 'pull'], { userId: null, id: 'sample-1' });
    const copy = sample.editableCopyFor('user-1', deps());

    const translated = copy.translateChildId('slot-1');
    expect(translated).not.toBe('slot-1');
    expect(copy.editable.slots[1].id).toBe(translated);
  });

  it('removing a slot by its sample id works through the translation', () => {
    const sample = withSlots(['push', 'pull'], { userId: null, id: 'sample-1' });
    const copy = sample.editableCopyFor('user-1', deps());

    expect(copy.editable.removeSlot(copy.translateChildId('slot-0'), NOW)).toBe(true);
    expect(copy.editable.slots.map((s) => s.templateId)).toEqual(['pull']);
  });

  /**
   * Being active is per-athlete state. A fork claiming it would give the
   * athlete two active routines without going through the coordination in
   * ./activation.
   */
  it('does not carry activation across to the fork', () => {
    const sample = withSlots(['push'], {
      userId: null,
      id: 'sample-1',
      isActive: true,
    });
    expect(sample.editableCopyFor('user-1', deps()).editable.isActive).toBe(false);
  });
});

describe('ownership', () => {
  it('treats a sample as neither deletable nor revertible', () => {
    const sample = withSlots([], { userId: null });
    expect(sample.isDeletable).toBe(false);
    expect(sample.canRevert).toBe(false);
  });

  it('treats an own routine that came from a sample as revertible', () => {
    const fork = withSlots([], { forkedFromId: 'sample-1' });
    expect(fork.canRevert).toBe(true);
    expect(fork.isDeletable).toBe(true);
  });

  it('treats an own routine created from scratch as deletable but not revertible', () => {
    const own = withSlots([]);
    expect(own.canRevert).toBe(false);
    expect(own.isDeletable).toBe(true);
  });
});

describe('snapshots', () => {
  it('round-trips through a snapshot', () => {
    const original = snapshot({
      slots: [
        { id: 'slot-0', position: 0, templateId: 'push' },
        { id: 'slot-1', position: 1, templateId: null },
      ],
    });
    expect(Routine.fromSnapshot(original).toSnapshot()).toEqual(original);
  });
});
