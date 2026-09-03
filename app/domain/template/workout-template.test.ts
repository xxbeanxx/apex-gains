import { describe, expect, it } from "vitest";

import { AthletePreferences } from "../athlete/preferences";
import { fixedClock } from "../shared/clock";
import { sequentialIds } from "../shared/ids";
import { Duration } from "../values/duration";
import { Speed } from "../values/speed";
import { Weight } from "../values/weight";
import { SetTarget } from "./set-target";
import {
  WorkoutTemplate,
  type TemplateSnapshot,
} from "./workout-template";

const NOW = new Date("2026-09-03T12:00:00Z");
const deps = () => ({ ids: sequentialIds("entry"), clock: fixedClock(NOW) });

function snapshot(overrides: Partial<TemplateSnapshot> = {}): TemplateSnapshot {
  return {
    id: "template-1",
    userId: "user-1",
    forkedFromId: null,
    name: "Push Day",
    createdAt: NOW,
    updatedAt: NOW,
    exercises: [],
    ...overrides,
  };
}

function withExercises(exerciseIds: string[], rest: Partial<TemplateSnapshot> = {}) {
  return WorkoutTemplate.fromSnapshot(
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
      })),
    }),
  );
}

describe("exercises", () => {
  it("appends at the end", () => {
    const template = withExercises(["bench"]);
    template.addExercise("row", SetTarget.none(), deps());
    expect(template.exercises.map((e) => e.exerciseId)).toEqual([
      "bench",
      "row",
    ]);
  });

  it("closes the gap when one is removed", () => {
    const template = withExercises(["bench", "row", "fly"]);
    expect(template.removeExercise("entry-1", NOW)).toBe(true);
    expect(template.exercises.map((e) => e.exerciseId)).toEqual(["bench", "fly"]);
    expect(template.exercises.map((e) => e.position)).toEqual([0, 1]);
  });

  it("reorders by swapping with a neighbour", () => {
    const template = withExercises(["bench", "row"]);
    expect(template.moveExercise("entry-1", "up", NOW)).toBe(true);
    expect(template.exercises.map((e) => e.exerciseId)).toEqual(["row", "bench"]);
  });

  it("reports an out-of-range move as a no-op", () => {
    const template = withExercises(["bench", "row"]);
    expect(template.moveExercise("entry-0", "up", NOW)).toBe(false);
    expect(template.exercises.map((e) => e.exerciseId)).toEqual(["bench", "row"]);
  });

  it("stamps the template when its contents change", () => {
    const template = withExercises(["bench"]);
    const later = new Date("2026-09-04T09:00:00Z");
    template.addExercise("row", SetTarget.none(), {
      ids: sequentialIds("entry"),
      clock: fixedClock(later),
    });
    expect(template.updatedAt).toEqual(later);
  });
});

describe("fork on write", () => {
  it("returns the template itself when the athlete already owns it", () => {
    const template = withExercises(["bench"]);
    const copy = template.editableCopyFor("user-1", deps());
    expect(copy.editable).toBe(template);
    expect(copy.forkedId).toBeNull();
  });

  it("copies a sample with its exercises and targets", () => {
    const sample = WorkoutTemplate.fromSnapshot(
      snapshot({
        id: "sample-1",
        userId: null,
        exercises: [
          {
            id: "entry-0",
            exerciseId: "bench",
            position: 0,
            targetSets: 3,
            targetReps: 10,
            targetWeight: "135.00",
            targetDurationSeconds: null,
            targetSpeed: null,
            targetResistance: null,
          },
        ],
      }),
    );

    const copy = sample.editableCopyFor("user-1", deps());

    expect(copy.editable.forkedFromId).toBe("sample-1");
    expect(copy.editable.ownership.isOwnedBy("user-1")).toBe(true);
    expect(copy.editable.exercises[0].target.sets).toBe(3);
    expect(copy.editable.exercises[0].target.weight?.inPounds).toBe(135);
  });

  it("maps a sample's entry ids onto the fork's, by position", () => {
    const sample = withExercises(["bench", "row"], {
      id: "sample-1",
      userId: null,
    });
    const copy = sample.editableCopyFor("user-1", deps());

    const translated = copy.translateChildId("entry-1");
    expect(translated).not.toBe("entry-1");
    expect(copy.editable.exercises[1].id).toBe(translated);
  });

  it("leaves the sample untouched when the fork is edited", () => {
    const sample = withExercises(["bench"], { id: "sample-1", userId: null });
    const copy = sample.editableCopyFor("user-1", deps());

    copy.editable.addExercise("row", SetTarget.none(), deps());

    expect(sample.exercises).toHaveLength(1);
    expect(copy.editable.exercises).toHaveLength(2);
  });
});

describe("SetTarget", () => {
  const imperial = new AthletePreferences("lb", "km", true);
  const metric = new AthletePreferences("kg", "mi", true);

  it("has nothing to say when nothing is targeted", () => {
    expect(SetTarget.none().format(imperial)).toBeNull();
    expect(SetTarget.none().isEmpty).toBe(true);
  });

  it("summarises a strength target", () => {
    const target = SetTarget.of({
      sets: 3,
      reps: 10,
      weight: Weight.lb(135),
    });
    expect(target.format(imperial)).toBe("3 x 10, 135 lb");
  });

  it("summarises a cardio target", () => {
    const target = SetTarget.of({
      duration: Duration.minutes(30),
      speed: Speed.kmh(8.5),
      resistance: 4,
    });
    expect(target.format(imperial)).toBe("30 min, 8.5 km/h, resistance 4");
  });

  /** The whole point of the value objects: one target, two readers, two units. */
  it("renders the same target in each athlete's units", () => {
    const target = SetTarget.of({
      sets: 3,
      reps: 10,
      weight: Weight.lb(135),
      speed: Speed.kmh(10),
    });

    expect(target.format(imperial)).toBe("3 x 10, 135 lb, 10 km/h");
    expect(target.format(metric)).toBe("3 x 10, 61.2 kg, 6.2 mph");
  });

  it("round-trips through storage", () => {
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
});
