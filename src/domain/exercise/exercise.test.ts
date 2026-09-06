import { describe, expect, it } from 'vitest';

import { Exercise, type ExerciseSnapshot } from '~domain/exercise/exercise';
import { fixedClock } from '~domain/shared/clock';
import { sequentialIds } from '~domain/shared/ids';

const NOW = new Date('2026-09-03T12:00:00Z');
const deps = () => ({ ids: sequentialIds('ex'), clock: fixedClock(NOW) });

function snapshot(overrides: Partial<ExerciseSnapshot> = {}): ExerciseSnapshot {
  return {
    id: 'exercise-1',
    userId: 'user-1',
    forkedFromId: null,
    name: 'Bench Press',
    exerciseType: 'strength',
    muscleGroup: 'chest',
    description: null,
    createdAt: NOW,
    equipmentIds: [],
    ...overrides,
  };
}

describe('exerciseType', () => {
  it('reads cardio work back as cardio', () => {
    expect(Exercise.fromSnapshot(snapshot({ exerciseType: 'cardio' })).isCardio).toBe(true);
    expect(Exercise.fromSnapshot(snapshot({ exerciseType: 'strength' })).isCardio).toBe(false);
  });
});

describe('equipment links', () => {
  it('links and unlinks equipment', () => {
    const exercise = Exercise.fromSnapshot(snapshot());

    exercise.setEquipment('barbell', true);
    expect(exercise.equipmentIds).toEqual(['barbell']);

    exercise.setEquipment('barbell', false);
    expect(exercise.equipmentIds).toEqual([]);
  });

  it('ignores linking the same equipment twice', () => {
    const exercise = Exercise.fromSnapshot(snapshot());
    exercise.setEquipment('barbell', true);
    exercise.setEquipment('barbell', true);
    expect(exercise.equipmentIds).toEqual(['barbell']);
  });
});

describe('fork on write', () => {
  it('returns the exercise itself when the athlete already owns it', () => {
    const exercise = Exercise.fromSnapshot(snapshot());
    const copy = exercise.editableCopyFor('user-1', deps());
    expect(copy.editable).toBe(exercise);
    expect(copy.forkedId).toBeNull();
  });

  it('copies a sample with its details and equipment', () => {
    const sample = Exercise.fromSnapshot(
      snapshot({
        id: 'sample-1',
        userId: null,
        equipmentIds: ['barbell', 'bench'],
      }),
    );

    const copy = sample.editableCopyFor('user-1', deps());

    expect(copy.editable.forkedFromId).toBe('sample-1');
    expect(copy.editable.ownership.isOwnedBy('user-1')).toBe(true);
    expect(copy.editable.name).toBe('Bench Press');
    expect(copy.editable.equipmentIds).toEqual(['barbell', 'bench']);
  });

  it('leaves the sample untouched when the copy is edited', () => {
    const sample = Exercise.fromSnapshot(snapshot({ userId: null }));
    const copy = sample.editableCopyFor('user-1', deps());

    copy.editable.updateDetails({
      name: 'My Bench',
      exerciseType: 'strength',
      muscleGroup: 'chest',
      description: 'Wider grip',
    });

    expect(sample.name).toBe('Bench Press');
    expect(copy.editable.name).toBe('My Bench');
  });

  /**
   * Equipment links are keyed by equipment id, which the copy shares with
   * the sample - so unlike plan slots there is nothing to translate.
   */
  it('needs no child id translation', () => {
    const sample = Exercise.fromSnapshot(snapshot({ userId: null }));
    const copy = sample.editableCopyFor('user-1', deps());
    expect(copy.translateChildId('barbell')).toBe('barbell');
  });
});

describe('ownership', () => {
  it('treats a sample as not revertible', () => {
    expect(Exercise.fromSnapshot(snapshot({ userId: null })).canRevert).toBe(false);
  });

  it('treats a copy of a sample as revertible', () => {
    expect(Exercise.fromSnapshot(snapshot({ forkedFromId: 'sample-1' })).canRevert).toBe(true);
  });

  it('treats an exercise created from scratch as not revertible', () => {
    const created = Exercise.create(
      'user-1',
      {
        name: 'Cable Crossover',
        exerciseType: 'strength',
        muscleGroup: 'chest',
        description: null,
      },
      deps(),
    );
    expect(created.canRevert).toBe(false);
    expect(created.ownership.isOwnedBy('user-1')).toBe(true);
  });
});

describe('copy for import', () => {
  it("becomes the importing athlete's own exercise, details and equipment intact", () => {
    const source = Exercise.fromSnapshot(snapshot({ id: 'theirs', userId: 'user-1', equipmentIds: ['barbell', 'bench'] }));

    const copy = source.copyForImport('user-2', deps());

    expect(copy.id).not.toBe('theirs');
    expect(copy.ownership.isOwnedBy('user-2')).toBe(true);
    expect(copy.name).toBe('Bench Press');
    expect(copy.muscleGroup).toBe('chest');
    // Equipment names are globally unique, so a row is the same row for
    // everyone - the ids carry over rather than being remapped.
    expect(copy.equipmentIds).toEqual(['barbell', 'bench']);
  });

  /**
   * Unlike workouts and plans, the link back is kept: it can only name a
   * sample, and a per-athlete unique name means there is never a second copy
   * to make `findForkOf` ambiguous. Keeping it is what stops the copy and the
   * sample it descends from listing side by side under one name.
   */
  it('keeps the link back to the sample the original was forked from', () => {
    const source = Exercise.fromSnapshot(snapshot({ id: 'theirs', userId: 'user-1', forkedFromId: 'sample-1' }));

    const copy = source.copyForImport('user-2', deps());

    expect(copy.forkedFromId).toBe('sample-1');
    expect(copy.canRevert).toBe(true);
  });

  it('leaves a copy of a plain exercise with nothing to revert to', () => {
    const source = Exercise.fromSnapshot(snapshot({ id: 'theirs', userId: 'user-1' }));

    expect(source.copyForImport('user-2', deps()).canRevert).toBe(false);
  });

  it('does not disturb the original', () => {
    const source = Exercise.fromSnapshot(snapshot({ id: 'theirs', userId: 'user-1', equipmentIds: ['barbell'] }));

    const copy = source.copyForImport('user-2', deps());
    copy.setEquipment('dumbbell', true);

    expect(source.equipmentIds).toEqual(['barbell']);
    expect(source.ownership.isOwnedBy('user-1')).toBe(true);
  });
});

describe('snapshots', () => {
  it('round-trips', () => {
    const original = snapshot({ equipmentIds: ['barbell'] });
    expect(Exercise.fromSnapshot(original).toSnapshot()).toEqual(original);
  });
});
