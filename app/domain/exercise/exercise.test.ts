import { describe, expect, it } from "vitest";

import { fixedClock } from "../shared/clock";
import { sequentialIds } from "../shared/ids";
import { Exercise, type ExerciseSnapshot } from "./exercise";
import { metricsFor } from "./exercise-type";

const NOW = new Date("2026-09-03T12:00:00Z");
const deps = () => ({ ids: sequentialIds("ex"), clock: fixedClock(NOW) });

function snapshot(overrides: Partial<ExerciseSnapshot> = {}): ExerciseSnapshot {
  return {
    id: "exercise-1",
    userId: "user-1",
    forkedFromId: null,
    name: "Bench Press",
    exerciseType: "strength",
    muscleGroup: "chest",
    description: null,
    createdAt: NOW,
    equipmentIds: [],
    ...overrides,
  };
}

describe("measurements by type", () => {
  it("measures strength work in reps and weight", () => {
    const metrics = metricsFor("strength");
    expect(metrics.reps && metrics.weight).toBe(true);
    expect(metrics.duration || metrics.speed || metrics.resistance).toBe(false);
  });

  it("measures cardio work in duration, speed and resistance", () => {
    const metrics = metricsFor("cardio");
    expect(metrics.duration && metrics.speed && metrics.resistance).toBe(true);
    expect(metrics.reps || metrics.weight).toBe(false);
  });

  it("exposes its own metrics", () => {
    const cardio = Exercise.fromSnapshot(snapshot({ exerciseType: "cardio" }));
    expect(cardio.isCardio).toBe(true);
    expect(cardio.metrics.duration).toBe(true);
  });
});

describe("equipment links", () => {
  it("links and unlinks equipment", () => {
    const exercise = Exercise.fromSnapshot(snapshot());

    exercise.setEquipment("barbell", true);
    expect(exercise.usesEquipment("barbell")).toBe(true);

    exercise.setEquipment("barbell", false);
    expect(exercise.usesEquipment("barbell")).toBe(false);
  });

  it("ignores linking the same equipment twice", () => {
    const exercise = Exercise.fromSnapshot(snapshot());
    exercise.setEquipment("barbell", true);
    exercise.setEquipment("barbell", true);
    expect(exercise.equipmentIds).toEqual(["barbell"]);
  });
});

describe("fork on write", () => {
  it("returns the exercise itself when the athlete already owns it", () => {
    const exercise = Exercise.fromSnapshot(snapshot());
    const copy = exercise.editableCopyFor("user-1", deps());
    expect(copy.editable).toBe(exercise);
    expect(copy.forkedId).toBeNull();
  });

  it("copies a sample with its details and equipment", () => {
    const sample = Exercise.fromSnapshot(
      snapshot({
        id: "sample-1",
        userId: null,
        equipmentIds: ["barbell", "bench"],
      }),
    );

    const copy = sample.editableCopyFor("user-1", deps());

    expect(copy.editable.forkedFromId).toBe("sample-1");
    expect(copy.editable.ownership.isOwnedBy("user-1")).toBe(true);
    expect(copy.editable.name).toBe("Bench Press");
    expect(copy.editable.equipmentIds).toEqual(["barbell", "bench"]);
  });

  it("leaves the sample untouched when the copy is edited", () => {
    const sample = Exercise.fromSnapshot(snapshot({ userId: null }));
    const copy = sample.editableCopyFor("user-1", deps());

    copy.editable.updateDetails({
      name: "My Bench",
      exerciseType: "strength",
      muscleGroup: "chest",
      description: "Wider grip",
    });

    expect(sample.name).toBe("Bench Press");
    expect(copy.editable.name).toBe("My Bench");
  });

  /**
   * Equipment links are keyed by equipment id, which the copy shares with
   * the sample - so unlike routine slots there is nothing to translate.
   */
  it("needs no child id translation", () => {
    const sample = Exercise.fromSnapshot(snapshot({ userId: null }));
    const copy = sample.editableCopyFor("user-1", deps());
    expect(copy.translateChildId("barbell")).toBe("barbell");
  });
});

describe("ownership", () => {
  it("treats a sample as not revertible", () => {
    expect(Exercise.fromSnapshot(snapshot({ userId: null })).canRevert).toBe(
      false,
    );
  });

  it("treats a copy of a sample as revertible", () => {
    expect(
      Exercise.fromSnapshot(snapshot({ forkedFromId: "sample-1" })).canRevert,
    ).toBe(true);
  });

  it("treats an exercise created from scratch as not revertible", () => {
    const created = Exercise.create(
      "user-1",
      {
        name: "Cable Crossover",
        exerciseType: "strength",
        muscleGroup: "chest",
        description: null,
      },
      deps(),
    );
    expect(created.canRevert).toBe(false);
    expect(created.ownership.isOwnedBy("user-1")).toBe(true);
  });
});

describe("snapshots", () => {
  it("round-trips", () => {
    const original = snapshot({ equipmentIds: ["barbell"] });
    expect(Exercise.fromSnapshot(original).toSnapshot()).toEqual(original);
  });
});
