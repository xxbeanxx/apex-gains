import { describe, expect, it } from 'vitest';

import { AthletePreferences } from '../athlete/preferences';
import { fixedClock } from '../shared/clock';
import { sequentialIds } from '../shared/ids';
import { Duration } from '../values/duration';
import { Speed } from '../values/speed';
import { Weight } from '../values/weight';
import { SetTarget } from './set-target';
import { Workout, type WorkoutSnapshot } from './workout';

const NOW = new Date('2026-09-03T12:00:00Z');
const deps = () => ({ ids: sequentialIds('entry'), clock: fixedClock(NOW) });

function snapshot(overrides: Partial<WorkoutSnapshot> = {}): WorkoutSnapshot {
  return {
    id: 'workout-1',
    userId: 'user-1',
    forkedFromId: null,
    name: 'Push Day',
    createdAt: NOW,
    updatedAt: NOW,
    exercises: [],
    ...overrides,
  };
}

function withExercises(exerciseIds: string[], rest: Partial<WorkoutSnapshot> = {}) {
  return Workout.fromSnapshot(
    snapshot({
      ...rest,
      exercises: exerciseIds.map((exerciseId, position) => ({
        id: `entry-${position}`,
        exerciseId,
        position,
        targetSets: null,
        targetReps: null,
        targetWeight: null,
        targetDurationSeconds: null,
        targetSpeed: null,
        targetResistance: null,
        targetRestSeconds: null,
      })),
    }),
  );
}

describe('exercises', () => {
  it('appends at the end', () => {
    const workout = withExercises(['bench']);
    workout.addExercise('row', SetTarget.none(), deps());
    expect(workout.exercises.map((e) => e.exerciseId)).toEqual(['bench', 'row']);
  });

  it('closes the gap when one is removed', () => {
    const workout = withExercises(['bench', 'row', 'fly']);
    expect(workout.removeExercise('entry-1', NOW)).toBe(true);
    expect(workout.exercises.map((e) => e.exerciseId)).toEqual(['bench', 'fly']);
    expect(workout.exercises.map((e) => e.position)).toEqual([0, 1]);
  });

  it('reorders by swapping with a neighbour', () => {
    const workout = withExercises(['bench', 'row']);
    expect(workout.moveExercise('entry-1', 'up', NOW)).toBe(true);
    expect(workout.exercises.map((e) => e.exerciseId)).toEqual(['row', 'bench']);
  });

  it('reports an out-of-range move as a no-op', () => {
    const workout = withExercises(['bench', 'row']);
    expect(workout.moveExercise('entry-0', 'up', NOW)).toBe(false);
    expect(workout.exercises.map((e) => e.exerciseId)).toEqual(['bench', 'row']);
  });

  it('stamps the workout when its contents change', () => {
    const workout = withExercises(['bench']);
    const later = new Date('2026-09-04T09:00:00Z');
    workout.addExercise('row', SetTarget.none(), {
      ids: sequentialIds('entry'),
      clock: fixedClock(later),
    });
    expect(workout.updatedAt).toEqual(later);
  });
});

describe('updateTarget', () => {
  const bothCardioFields = { showSpeed: true, showResistance: true };

  it('replaces the entry’s target', () => {
    const workout = withExercises(['bench']);
    const target = SetTarget.of({ sets: 3, reps: 8, weight: Weight.lb(135) });

    expect(workout.updateTarget('entry-0', target, bothCardioFields, NOW)).toBe(true);
    expect(workout.exercises[0].target.sets).toBe(3);
    expect(workout.exercises[0].target.reps).toBe(8);
    expect(workout.exercises[0].target.weight?.inPounds).toBe(135);
  });

  it('reports an unknown entry as a no-op', () => {
    const workout = withExercises(['bench']);
    expect(workout.updateTarget('missing', SetTarget.none(), bothCardioFields, NOW)).toBe(false);
  });

  it('drops a speed the equipment has no way to report', () => {
    const workout = withExercises(['row']);
    const target = SetTarget.of({ duration: Duration.minutes(20), speed: Speed.kmh(8), resistance: 5 });

    workout.updateTarget('entry-0', target, { showSpeed: false, showResistance: true }, NOW);

    expect(workout.exercises[0].target.speed).toBeNull();
    expect(workout.exercises[0].target.duration?.inMinutes).toBe(20);
    expect(workout.exercises[0].target.resistance).toBe(5);
  });

  it('drops a resistance the equipment has no way to report', () => {
    const workout = withExercises(['row']);
    const target = SetTarget.of({ speed: Speed.kmh(8), resistance: 5 });

    workout.updateTarget('entry-0', target, { showSpeed: true, showResistance: false }, NOW);

    expect(workout.exercises[0].target.speed?.inKmPerHour).toBe(8);
    expect(workout.exercises[0].target.resistance).toBeNull();
  });

  it('keeps rest through equipment that reports neither speed nor resistance, since it applies to strength and cardio alike', () => {
    const workout = withExercises(['row']);
    const target = SetTarget.of({ speed: Speed.kmh(8), resistance: 5, rest: Duration.seconds(90) });

    workout.updateTarget('entry-0', target, { showSpeed: false, showResistance: false }, NOW);

    expect(workout.exercises[0].target.speed).toBeNull();
    expect(workout.exercises[0].target.resistance).toBeNull();
    expect(workout.exercises[0].target.rest?.inSeconds).toBe(90);
  });

  it('stamps the workout when a target changes', () => {
    const workout = withExercises(['bench']);
    const later = new Date('2026-09-04T09:00:00Z');
    workout.updateTarget('entry-0', SetTarget.none(), bothCardioFields, later);
    expect(workout.updatedAt).toEqual(later);
  });
});

describe('fork on write', () => {
  it('returns the workout itself when the athlete already owns it', () => {
    const workout = withExercises(['bench']);
    const copy = workout.editableCopyFor('user-1', deps());
    expect(copy.editable).toBe(workout);
    expect(copy.forkedId).toBeNull();
  });

  it('copies a sample with its exercises and targets', () => {
    const sample = Workout.fromSnapshot(
      snapshot({
        id: 'sample-1',
        userId: null,
        exercises: [
          {
            id: 'entry-0',
            exerciseId: 'bench',
            position: 0,
            targetSets: 3,
            targetReps: 10,
            targetWeight: '135.00',
            targetDurationSeconds: null,
            targetSpeed: null,
            targetResistance: null,
            targetRestSeconds: null,
          },
        ],
      }),
    );

    const copy = sample.editableCopyFor('user-1', deps());

    expect(copy.editable.forkedFromId).toBe('sample-1');
    expect(copy.editable.ownership.isOwnedBy('user-1')).toBe(true);
    expect(copy.editable.exercises[0].target.sets).toBe(3);
    expect(copy.editable.exercises[0].target.weight?.inPounds).toBe(135);
  });

  it("maps a sample's entry ids onto the fork's, by position", () => {
    const sample = withExercises(['bench', 'row'], {
      id: 'sample-1',
      userId: null,
    });
    const copy = sample.editableCopyFor('user-1', deps());

    const translated = copy.translateChildId('entry-1');
    expect(translated).not.toBe('entry-1');
    expect(copy.editable.exercises[1].id).toBe(translated);
  });

  it('leaves the sample untouched when the fork is edited', () => {
    const sample = withExercises(['bench'], { id: 'sample-1', userId: null });
    const copy = sample.editableCopyFor('user-1', deps());

    copy.editable.addExercise('row', SetTarget.none(), deps());

    expect(sample.exercises).toHaveLength(1);
    expect(copy.editable.exercises).toHaveLength(2);
  });
});

describe('copy for import', () => {
  const shared = () => withExercises(['bench', 'row'], { userId: 'user-1', id: 'theirs', forkedFromId: 'sample-1' });

  it("becomes the importing athlete's own workout", () => {
    const copy = shared().copyForImport('user-2', (id) => `mine-${id}`, deps());

    expect(copy.ownership.userId).toBe('user-2');
    expect(copy.name).toBe('Push Day');
    expect(copy.isDeletable).toBe(true);
  });

  /**
   * A shared plan can be imported twice, and two rows forked from one
   * sample would make `findForkOf` ambiguous - so the link back is dropped
   * even though the workout it was copied from had one.
   */
  it('drops the link back to the sample the original was forked from', () => {
    const original = shared();
    expect(original.canRevert).toBe(true);

    const copy = original.copyForImport('user-2', (id) => id, deps());

    expect(copy.forkedFromId).toBeNull();
    expect(copy.canRevert).toBe(false);
  });

  it("remaps each entry onto the importer's own exercise, in order", () => {
    const copy = shared().copyForImport('user-2', (id) => `mine-${id}`, deps());

    expect(copy.exercises.map((entry) => entry.exerciseId)).toEqual(['mine-bench', 'mine-row']);
    expect(copy.exercises.map((entry) => entry.position)).toEqual([0, 1]);
  });

  it('keeps the targets the original set', () => {
    const original = shared();
    original.addExercise('squat', SetTarget.of({ sets: 3, reps: 10, weight: Weight.lb(135) }), deps());

    const copy = original.copyForImport('user-2', (id) => id, deps());

    expect(copy.exercises[2]!.target.format(new AthletePreferences('lb', 'km', 'in', true, 'UTC'))).toBe('3 x 10, 135 lb');
  });

  it('gives the entries new ids so the original keeps its own', () => {
    const original = shared();
    // A generator of its own: the shared `deps()` restarts at entry-1, which
    // is an id `withExercises` has already handed the original.
    const copy = original.copyForImport('user-2', (id) => id, {
      ids: sequentialIds('copied'),
      clock: fixedClock(NOW),
    });

    const originalIds = original.exercises.map((entry) => entry.id);
    expect(copy.exercises.map((entry) => entry.id).some((id) => originalIds.includes(id))).toBe(false);
    expect(copy.id).not.toBe(original.id);
  });
});

describe('SetTarget', () => {
  const imperial = new AthletePreferences('lb', 'km', 'in', true, 'UTC');
  const metric = new AthletePreferences('kg', 'mi', 'cm', true, 'UTC');

  it('has nothing to say when nothing is targeted', () => {
    expect(SetTarget.none().format(imperial)).toBeNull();
    expect(SetTarget.none().isEmpty).toBe(true);
  });

  it('summarises a strength target', () => {
    const target = SetTarget.of({
      sets: 3,
      reps: 10,
      weight: Weight.lb(135),
    });
    expect(target.format(imperial)).toBe('3 x 10, 135 lb');
  });

  it('summarises a cardio target', () => {
    const target = SetTarget.of({
      duration: Duration.minutes(30),
      speed: Speed.kmh(8.5),
      resistance: 4,
    });
    expect(target.format(imperial)).toBe('30 min, 8.5 km/h, resistance 4');
  });

  /** The whole point of the value objects: one target, two readers, two units. */
  it("renders the same target in each athlete's units", () => {
    const target = SetTarget.of({
      sets: 3,
      reps: 10,
      weight: Weight.lb(135),
      speed: Speed.kmh(10),
    });

    expect(target.format(imperial)).toBe('3 x 10, 135 lb, 10 km/h');
    expect(target.format(metric)).toBe('3 x 10, 61.2 kg, 6.2 mph');
  });

  it('round-trips through storage', () => {
    const original = SetTarget.of({
      sets: 3,
      reps: 10,
      weight: Weight.lb(135),
      duration: Duration.minutes(30),
      speed: Speed.kmh(8.5),
      resistance: 4,
    });
    const restored = SetTarget.fromSnapshot(original.toSnapshot());
    expect(restored.format(imperial)).toBe(original.format(imperial));
  });

  it('is not empty when only rest is set', () => {
    expect(SetTarget.of({ rest: Duration.seconds(90) }).isEmpty).toBe(false);
  });

  it('appends rest to the summary', () => {
    const target = SetTarget.of({ sets: 3, reps: 10, weight: Weight.lb(135), rest: Duration.seconds(90) });
    expect(target.format(imperial)).toBe('3 x 10, 135 lb, 1.5 min rest');
  });

  it('rest round-trips through storage', () => {
    const original = SetTarget.of({ rest: Duration.seconds(90) });
    expect(SetTarget.fromSnapshot(original.toSnapshot()).rest?.inSeconds).toBe(90);
  });
});
