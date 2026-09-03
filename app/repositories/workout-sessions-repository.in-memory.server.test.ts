import { beforeEach, describe, expect, it } from "vitest";

import { InMemoryEquipmentRepository } from "./equipment-repository.in-memory.server";
import type { ExercisesRepository } from "./exercises-repository";
import { InMemoryExercisesRepository } from "./exercises-repository.in-memory.server";
import { InMemoryWorkoutSessionsRepository } from "./workout-sessions-repository.in-memory.server";

async function createdExercise(
  exercisesRepository: ExercisesRepository,
  name = "Bench Press",
) {
  const result = await exercisesRepository.create("user-1", {
    name,
    exerciseType: "strength",
  });
  if (result.outcome !== "created") throw new Error("setup failed");
  return result.exercise;
}

describe("InMemoryWorkoutSessionsRepository", () => {
  let exercisesRepository: ExercisesRepository;
  let repository: InMemoryWorkoutSessionsRepository;

  beforeEach(() => {
    exercisesRepository = new InMemoryExercisesRepository(
      new InMemoryEquipmentRepository(),
    );
    repository = new InMemoryWorkoutSessionsRepository(exercisesRepository);
  });

  describe("getOrCreateForDate", () => {
    it("creates a session on first call and reuses it on the next", async () => {
      const first = await repository.getOrCreateForDate("user-1", "2026-09-02", {
        routineId: "routine-1",
        templateId: null,
        isRestDay: false,
      });
      expect(first.created).toBe(true);

      const second = await repository.getOrCreateForDate(
        "user-1",
        "2026-09-02",
        { routineId: "routine-1", templateId: null, isRestDay: false },
      );

      expect(second.created).toBe(false);
      expect(second.session.id).toBe(first.session.id);
    });

    it("keeps sessions separate per user and per date", async () => {
      const day1 = await repository.getOrCreateForDate("user-1", "2026-09-01", {
        routineId: null,
        templateId: null,
        isRestDay: true,
      });
      const day2 = await repository.getOrCreateForDate("user-1", "2026-09-02", {
        routineId: null,
        templateId: null,
        isRestDay: true,
      });
      const otherUser = await repository.getOrCreateForDate(
        "user-2",
        "2026-09-01",
        { routineId: null, templateId: null, isRestDay: true },
      );

      expect(day1.session.id).not.toBe(day2.session.id);
      expect(day1.session.id).not.toBe(otherUser.session.id);
    });
  });

  describe("findWithSetsForDate", () => {
    it("returns null when there's no session for that date", async () => {
      expect(
        await repository.findWithSetsForDate("user-1", "2026-09-02"),
      ).toBeNull();
    });

    it("joins each set with its exercise", async () => {
      const exercise = await createdExercise(exercisesRepository);
      const { session } = await repository.getOrCreateForDate(
        "user-1",
        "2026-09-02",
        { routineId: null, templateId: null, isRestDay: false },
      );
      await repository.addSet(session.id, exercise.id, { reps: 10 });

      const detail = await repository.findWithSetsForDate(
        "user-1",
        "2026-09-02",
      );

      expect(detail?.sets).toEqual([
        expect.objectContaining({ reps: 10, exercise }),
      ]);
    });
  });

  describe("addSet", () => {
    it("assigns increasing setNumbers per (session, exercise) pair", async () => {
      const exercise = await createdExercise(exercisesRepository);
      const { session } = await repository.getOrCreateForDate(
        "user-1",
        "2026-09-02",
        { routineId: null, templateId: null, isRestDay: false },
      );

      const first = await repository.addSet(session.id, exercise.id, {
        reps: 10,
      });
      const second = await repository.addSet(session.id, exercise.id, {
        reps: 8,
      });

      expect(first.setNumber).toBe(1);
      expect(second.setNumber).toBe(2);
    });

    it("numbers a different exercise independently", async () => {
      const bench = await createdExercise(exercisesRepository, "Bench Press");
      const squat = await createdExercise(exercisesRepository, "Squat");
      const { session } = await repository.getOrCreateForDate(
        "user-1",
        "2026-09-02",
        { routineId: null, templateId: null, isRestDay: false },
      );

      await repository.addSet(session.id, bench.id, { reps: 10 });
      const squatSet = await repository.addSet(session.id, squat.id, {
        reps: 5,
      });

      expect(squatSet.setNumber).toBe(1);
    });
  });

  describe("removeSetOwnedByUser", () => {
    it("returns not-found for an unknown set", async () => {
      expect(
        await repository.removeSetOwnedByUser("user-1", "missing"),
      ).toBe("not-found");
    });

    it("returns not-found and does not remove a set owned by another user", async () => {
      const exercise = await createdExercise(exercisesRepository);
      const { session } = await repository.getOrCreateForDate(
        "user-1",
        "2026-09-02",
        { routineId: null, templateId: null, isRestDay: false },
      );
      const set = await repository.addSet(session.id, exercise.id, {
        reps: 10,
      });

      expect(await repository.removeSetOwnedByUser("user-2", set.id)).toBe(
        "not-found",
      );
      const detail = await repository.findWithSetsForDate(
        "user-1",
        "2026-09-02",
      );
      expect(detail?.sets).toHaveLength(1);
    });

    it("removes a set owned by the user", async () => {
      const exercise = await createdExercise(exercisesRepository);
      const { session } = await repository.getOrCreateForDate(
        "user-1",
        "2026-09-02",
        { routineId: null, templateId: null, isRestDay: false },
      );
      const set = await repository.addSet(session.id, exercise.id, {
        reps: 10,
      });

      expect(await repository.removeSetOwnedByUser("user-1", set.id)).toBe(
        "removed",
      );
      const detail = await repository.findWithSetsForDate(
        "user-1",
        "2026-09-02",
      );
      expect(detail?.sets).toEqual([]);
    });
  });

  describe("listForDateRange / listSetSessionExercisePairs", () => {
    it("only returns sessions within [startDate, endDateExclusive)", async () => {
      await repository.getOrCreateForDate("user-1", "2026-08-25", {
        routineId: null,
        templateId: null,
        isRestDay: true,
      });
      const inRange = await repository.getOrCreateForDate(
        "user-1",
        "2026-08-26",
        { routineId: null, templateId: null, isRestDay: true },
      );
      await repository.getOrCreateForDate("user-1", "2026-09-02", {
        routineId: null,
        templateId: null,
        isRestDay: true,
      });

      const sessions = await repository.listForDateRange(
        "user-1",
        "2026-08-26",
        "2026-09-02",
      );

      expect(sessions.map((s) => s.id)).toEqual([inRange.session.id]);
    });

    it("returns flat (sessionId, exerciseId) pairs for the given sessions", async () => {
      const exercise = await createdExercise(exercisesRepository);
      const { session } = await repository.getOrCreateForDate(
        "user-1",
        "2026-09-02",
        { routineId: null, templateId: null, isRestDay: false },
      );
      await repository.addSet(session.id, exercise.id, { reps: 10 });
      await repository.addSet(session.id, exercise.id, { reps: 8 });

      const pairs = await repository.listSetSessionExercisePairs([
        session.id,
      ]);

      expect(pairs).toEqual([
        { sessionId: session.id, exerciseId: exercise.id },
        { sessionId: session.id, exerciseId: exercise.id },
      ]);
    });
  });
});
