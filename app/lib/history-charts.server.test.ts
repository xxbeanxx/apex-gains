import { describe, expect, it } from "vitest";

import type { Exercise, SessionSet } from "~/db/schema";
import type { WorkoutSessionWithSets } from "~/repositories/workout-sessions-repository";
import { mock } from "~/test/mock";

import {
  computeConsistencyHeatmap,
  computeExerciseProgressSeries,
  computeMuscleGroupBalance,
  computePersonalRecords,
  computeWeeklySetCount,
  computeWeeklyTonnage,
} from "./history-charts.server";

function exercise(overrides: Partial<Exercise> = {}): Exercise {
  return mock<Exercise>({
    id: "ex-1",
    name: "Bench Press",
    exerciseType: "strength",
    ...overrides,
  });
}

function set(overrides: Partial<SessionSet> = {}): SessionSet {
  return mock<SessionSet>({
    id: "set-1",
    setNumber: 1,
    reps: null,
    weight: null,
    durationSeconds: null,
    speed: null,
    resistanceLevel: null,
    ...overrides,
  });
}

function session(
  date: string,
  sets: Array<{ exercise: Exercise; set: SessionSet }>,
): WorkoutSessionWithSets {
  return mock<WorkoutSessionWithSets>({
    id: `session-${date}`,
    date,
    isRestDay: false,
    sets: sets.map(({ exercise: ex, set: s }) => ({ ...s, exerciseId: ex.id, exercise: ex })),
  });
}

describe("computeWeeklySetCount", () => {
  it("buckets sets into the Monday-start week they fall in", () => {
    // 2026-09-02 is a Wednesday, week-of 2026-08-31.
    const sessions = [
      session("2026-09-02", [{ exercise: exercise(), set: set() }]),
      session("2026-08-30", [
        { exercise: exercise(), set: set() },
        { exercise: exercise(), set: set() },
      ]),
    ];

    const weeks = computeWeeklySetCount(sessions, 2, "2026-09-02");

    expect(weeks).toHaveLength(2);
    expect(weeks[0]).toMatchObject({ weekStart: "2026-08-24", value: 2 });
    expect(weeks[1]).toMatchObject({
      weekStart: "2026-08-31",
      value: 1,
      isCurrentWeek: true,
    });
  });

  it("returns zero-count weeks for gaps, oldest first", () => {
    const weeks = computeWeeklySetCount([], 3, "2026-09-02");

    expect(weeks.map((w) => w.weekStart)).toEqual([
      "2026-08-17",
      "2026-08-24",
      "2026-08-31",
    ]);
    expect(weeks.every((w) => w.value === 0)).toBe(true);
  });

  it("labels each week by its Monday", () => {
    const weeks = computeWeeklySetCount([], 1, "2026-09-02");
    expect(weeks[0].label).toBe("Aug 31");
  });
});

describe("computeWeeklyTonnage", () => {
  it("sums weight x reps for sets that have both", () => {
    const bench = exercise({ id: "ex-bench" });
    const sessions = [
      session("2026-09-02", [
        { exercise: bench, set: set({ weight: "135", reps: 8 }) },
        { exercise: bench, set: set({ weight: "145", reps: 5 }) },
      ]),
    ];

    const weeks = computeWeeklyTonnage(sessions, 1, "2026-09-02");

    expect(weeks[0].value).toBeCloseTo(135 * 8 + 145 * 5);
  });

  it("ignores sets missing a weight or a rep count", () => {
    const pushups = exercise({ id: "ex-pushups" });
    const row = exercise({ id: "ex-row", exerciseType: "cardio" });
    const sessions = [
      session("2026-09-02", [
        { exercise: pushups, set: set({ reps: 20 }) },
        { exercise: row, set: set({ durationSeconds: 1200 }) },
      ]),
    ];

    const weeks = computeWeeklyTonnage(sessions, 1, "2026-09-02");

    expect(weeks[0].value).toBe(0);
  });
});

describe("computeConsistencyHeatmap", () => {
  it("marks a logged workout day with its set count", () => {
    const sessions = [
      session("2026-09-02", [
        { exercise: exercise(), set: set() },
        { exercise: exercise(), set: set() },
      ]),
    ];

    const days = computeConsistencyHeatmap(sessions, 1, "2026-09-02");
    const day = days.find((d) => d.date === "2026-09-02");

    expect(day).toEqual({ date: "2026-09-02", status: "workout", setCount: 2 });
  });

  it("marks a rest day and a day with no session row", () => {
    const restSession = mock<WorkoutSessionWithSets>({
      id: "rest-session",
      date: "2026-08-31",
      isRestDay: true,
      sets: [],
    });

    const days = computeConsistencyHeatmap([restSession], 1, "2026-09-02");

    expect(days.find((d) => d.date === "2026-08-31")).toEqual({
      date: "2026-08-31",
      status: "rest",
      setCount: 0,
    });
    expect(days.find((d) => d.date === "2026-09-01")).toEqual({
      date: "2026-09-01",
      status: "none",
      setCount: 0,
    });
  });

  it("returns weeks*7 days, Monday-aligned, ending in the week containing today", () => {
    const days = computeConsistencyHeatmap([], 2, "2026-09-02");

    expect(days).toHaveLength(14);
    expect(days[0].date).toBe("2026-08-24");
    expect(days.at(-1)?.date).toBe("2026-09-06");
  });
});

describe("computeMuscleGroupBalance", () => {
  it("counts sets per muscle group within the window, most-trained first", () => {
    const bench = exercise({ id: "ex-bench", muscleGroup: "Chest" });
    const row = exercise({ id: "ex-row", muscleGroup: "Back" });
    const sessions = [
      session("2026-09-01", [
        { exercise: bench, set: set() },
        { exercise: bench, set: set() },
        { exercise: row, set: set() },
      ]),
    ];

    const balance = computeMuscleGroupBalance(sessions, 7, "2026-09-02");

    expect(balance).toEqual([
      { muscleGroup: "Chest", setCount: 2 },
      { muscleGroup: "Back", setCount: 1 },
    ]);
  });

  it("groups muscle groups case-insensitively, keeping the first-seen casing", () => {
    const bench = exercise({ id: "ex-bench", muscleGroup: "chest" });
    const flye = exercise({ id: "ex-flye", muscleGroup: "Chest" });
    const sessions = [
      session("2026-09-01", [
        { exercise: bench, set: set() },
        { exercise: flye, set: set() },
      ]),
    ];

    const balance = computeMuscleGroupBalance(sessions, 7, "2026-09-02");

    expect(balance).toEqual([{ muscleGroup: "chest", setCount: 2 }]);
  });

  it("folds a blank muscle group into Other", () => {
    const mystery = exercise({ id: "ex-mystery", muscleGroup: null });
    const sessions = [session("2026-09-01", [{ exercise: mystery, set: set() }])];

    const balance = computeMuscleGroupBalance(sessions, 7, "2026-09-02");

    expect(balance).toEqual([{ muscleGroup: "Other", setCount: 1 }]);
  });

  it("excludes sets outside the day window", () => {
    const bench = exercise({ id: "ex-bench", muscleGroup: "Chest" });
    const sessions = [session("2026-08-01", [{ exercise: bench, set: set() }])];

    const balance = computeMuscleGroupBalance(sessions, 7, "2026-09-02");

    expect(balance).toEqual([]);
  });

  it("folds the tail past the top 7 groups into Other", () => {
    const sessions = [
      session(
        "2026-09-01",
        Array.from({ length: 9 }, (_, i) => ({
          exercise: exercise({ id: `ex-${i}`, muscleGroup: `Group ${i}` }),
          set: set(),
        })),
      ),
    ];

    const balance = computeMuscleGroupBalance(sessions, 7, "2026-09-02");

    expect(balance).toHaveLength(8);
    expect(balance.at(-1)).toEqual({ muscleGroup: "Other", setCount: 2 });
  });
});

describe("computePersonalRecords", () => {
  it("picks the highest value across all logged days", () => {
    const bench = exercise({ id: "ex-bench" });
    const sessions = [
      session("2026-08-01", [{ exercise: bench, set: set({ weight: "135", reps: 8 }) }]),
      session("2026-08-15", [{ exercise: bench, set: set({ weight: "155", reps: 5 }) }]),
      session("2026-08-08", [{ exercise: bench, set: set({ weight: "140", reps: 8 }) }]),
    ];

    const [record] = computePersonalRecords(sessions);

    expect(record.date).toBe("2026-08-15");
    expect(record.value).toBeCloseTo(155 * (1 + 5 / 30));
  });

  it("breaks a tie by the earlier date", () => {
    const bench = exercise({ id: "ex-bench" });
    const sessions = [
      session("2026-08-15", [{ exercise: bench, set: set({ weight: "135", reps: 8 }) }]),
      session("2026-08-01", [{ exercise: bench, set: set({ weight: "135", reps: 8 }) }]),
    ];

    const [record] = computePersonalRecords(sessions);

    expect(record.date).toBe("2026-08-01");
  });

  it("includes an exercise logged on only one day, unlike the progress series", () => {
    const bench = exercise({ id: "ex-bench" });
    const sessions = [
      session("2026-08-01", [{ exercise: bench, set: set({ weight: "135", reps: 8 }) }]),
    ];

    const records = computePersonalRecords(sessions);

    expect(records).toHaveLength(1);
    expect(records[0].exerciseId).toBe("ex-bench");
  });

  it("orders records by most-recently-set first", () => {
    const bench = exercise({ id: "ex-bench", name: "Bench Press" });
    const squat = exercise({ id: "ex-squat", name: "Squat" });
    const sessions = [
      session("2026-08-01", [{ exercise: bench, set: set({ weight: "135", reps: 8 }) }]),
      session("2026-08-15", [{ exercise: squat, set: set({ weight: "185", reps: 5 }) }]),
    ];

    const records = computePersonalRecords(sessions);

    expect(records.map((r) => r.exerciseId)).toEqual(["ex-squat", "ex-bench"]);
  });

  it("returns an empty list for no sessions", () => {
    expect(computePersonalRecords([])).toEqual([]);
  });
});

describe("computeExerciseProgressSeries", () => {
  it("tracks estimated 1RM for a weighted strength exercise across days", () => {
    const bench = exercise({ id: "ex-bench", name: "Bench Press" });
    const sessions = [
      session("2026-08-01", [
        { exercise: bench, set: set({ weight: "135", reps: 8 }) },
      ]),
      session("2026-08-08", [
        { exercise: bench, set: set({ weight: "140", reps: 8 }) },
      ]),
    ];

    const [series] = computeExerciseProgressSeries(sessions);

    expect(series.exerciseId).toBe("ex-bench");
    expect(series.metricLabel).toBe("Est. best set (1RM)");
    expect(series.unit).toBe("lb");
    expect(series.points).toHaveLength(2);
    expect(series.points[0].value).toBeCloseTo(135 * (1 + 8 / 30));
    expect(series.points[1].value).toBeCloseTo(140 * (1 + 8 / 30));
  });

  it("takes the best set of the day when multiple sets are logged", () => {
    const bench = exercise({ id: "ex-bench" });
    const sessions = [
      session("2026-08-01", [
        { exercise: bench, set: set({ weight: "135", reps: 8 }) },
        { exercise: bench, set: set({ weight: "155", reps: 5 }) },
      ]),
      session("2026-08-08", [
        { exercise: bench, set: set({ weight: "140", reps: 8 }) },
      ]),
    ];

    const [series] = computeExerciseProgressSeries(sessions);

    expect(series.points[0].value).toBeCloseTo(
      Math.max(135 * (1 + 8 / 30), 155 * (1 + 5 / 30)),
    );
  });

  it("falls back to rep count for a bodyweight-only exercise", () => {
    const pushups = exercise({ id: "ex-pushups", name: "Push-ups" });
    const sessions = [
      session("2026-08-01", [{ exercise: pushups, set: set({ reps: 20 }) }]),
      session("2026-08-08", [{ exercise: pushups, set: set({ reps: 25 }) }]),
    ];

    const [series] = computeExerciseProgressSeries(sessions);

    expect(series.metricLabel).toBe("Best set");
    expect(series.unit).toBe("reps");
    expect(series.points.map((p) => p.value)).toEqual([20, 25]);
  });

  it("tracks duration in minutes for a cardio exercise", () => {
    const row = exercise({
      id: "ex-row",
      name: "Rowing",
      exerciseType: "cardio",
    });
    const sessions = [
      session("2026-08-01", [
        { exercise: row, set: set({ durationSeconds: 1200 }) },
      ]),
      session("2026-08-08", [
        { exercise: row, set: set({ durationSeconds: 1500 }) },
      ]),
    ];

    const [series] = computeExerciseProgressSeries(sessions);

    expect(series.metricLabel).toBe("Duration");
    expect(series.unit).toBe("min");
    expect(series.points.map((p) => p.value)).toEqual([20, 25]);
  });

  it("excludes an exercise logged on only one distinct day", () => {
    const bench = exercise({ id: "ex-bench" });
    const sessions = [
      session("2026-08-01", [
        { exercise: bench, set: set({ weight: "135", reps: 8 }) },
        { exercise: bench, set: set({ weight: "135", reps: 6 }) },
      ]),
    ];

    expect(computeExerciseProgressSeries(sessions)).toEqual([]);
  });

  it("orders series by number of tracked days, most first", () => {
    const bench = exercise({ id: "ex-bench", name: "Bench Press" });
    const squat = exercise({ id: "ex-squat", name: "Squat" });
    const sessions = [
      session("2026-08-01", [
        { exercise: bench, set: set({ weight: "135", reps: 8 }) },
        { exercise: squat, set: set({ weight: "185", reps: 5 }) },
      ]),
      session("2026-08-08", [
        { exercise: bench, set: set({ weight: "140", reps: 8 }) },
      ]),
      session("2026-08-15", [
        { exercise: bench, set: set({ weight: "145", reps: 8 }) },
      ]),
      session("2026-08-22", [
        { exercise: squat, set: set({ weight: "190", reps: 5 }) },
      ]),
    ];

    const series = computeExerciseProgressSeries(sessions);

    expect(series.map((s) => s.exerciseId)).toEqual(["ex-bench", "ex-squat"]);
  });

  it("returns an empty list for no sessions", () => {
    expect(computeExerciseProgressSeries([])).toEqual([]);
  });
});
