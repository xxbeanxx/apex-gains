import { beforeEach, describe, expect, it } from "vitest";

import { InMemoryEquipmentRepository } from "./equipment-repository.in-memory.server";
import type { ExercisesRepository } from "./exercises-repository";
import { InMemoryExercisesRepository } from "./exercises-repository.in-memory.server";
import { InMemoryTemplatesRepository } from "./templates-repository.in-memory.server";

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

describe("InMemoryTemplatesRepository", () => {
  let exercisesRepository: ExercisesRepository;
  let repository: InMemoryTemplatesRepository;

  beforeEach(() => {
    exercisesRepository = new InMemoryExercisesRepository(
      new InMemoryEquipmentRepository(),
    );
    repository = new InMemoryTemplatesRepository(exercisesRepository);
  });

  describe("create / listForUser / findVisibleForUser", () => {
    it("creates an owned template with no exercises", async () => {
      const template = await repository.create("user-1", "Push Day");

      const rows = await repository.listForUser("user-1", true);
      expect(rows).toEqual([
        expect.objectContaining({ id: template.id, templateExercises: [] }),
      ]);
    });

    it("excludes another user's templates", async () => {
      await repository.create("user-1", "Push Day");

      expect(await repository.listForUser("user-2", true)).toEqual([]);
    });

    it("findVisibleForUser returns null for an unknown or inaccessible template", async () => {
      const template = await repository.create("user-1", "Push Day");

      expect(await repository.findVisibleForUser("user-1", "missing")).toBeNull();
      expect(
        await repository.findVisibleForUser("user-2", template.id),
      ).toBeNull();
    });

    it("findVisibleForUser joins each template exercise with its exercise", async () => {
      const template = await repository.create("user-1", "Push Day");
      const exercise = await createdExercise(exercisesRepository);
      await repository.addExercise("user-1", template.id, {
        exerciseId: exercise.id,
      });

      const detail = await repository.findVisibleForUser("user-1", template.id);

      expect(detail?.templateExercises).toEqual([
        expect.objectContaining({ exercise }),
      ]);
    });
  });

  describe("delete", () => {
    it("returns not-found for a missing template", async () => {
      expect(await repository.delete("user-1", "missing")).toEqual({
        outcome: "not-found",
      });
    });

    it("deletes an owned template", async () => {
      const template = await repository.create("user-1", "Push Day");

      expect(await repository.delete("user-1", template.id)).toEqual({
        outcome: "deleted",
      });
      expect(await repository.findVisibleForUser("user-1", template.id)).toBeNull();
    });
  });

  describe("rename / addExercise / removeExercise / moveExercise", () => {
    it("renames an owned template", async () => {
      const template = await repository.create("user-1", "Push Day");

      const result = await repository.rename("user-1", template.id, "Chest Day");

      expect(result).toEqual({ outcome: "renamed", forkedTemplateId: null });
      const detail = await repository.findVisibleForUser("user-1", template.id);
      expect(detail?.name).toBe("Chest Day");
    });

    it("returns exercise-not-found when adding an unknown exercise", async () => {
      const template = await repository.create("user-1", "Push Day");

      const result = await repository.addExercise("user-1", template.id, {
        exerciseId: "missing",
      });

      expect(result).toEqual({ outcome: "exercise-not-found" });
    });

    it("adds exercises at increasing positions", async () => {
      const template = await repository.create("user-1", "Push Day");
      const bench = await createdExercise(exercisesRepository, "Bench Press");
      const squat = await createdExercise(exercisesRepository, "Squat");

      await repository.addExercise("user-1", template.id, {
        exerciseId: bench.id,
      });
      await repository.addExercise("user-1", template.id, {
        exerciseId: squat.id,
      });

      const detail = await repository.findVisibleForUser("user-1", template.id);
      expect(detail?.templateExercises.map((te) => te.position)).toEqual([
        0, 1,
      ]);
    });

    it("removes an exercise from a template", async () => {
      const template = await repository.create("user-1", "Push Day");
      const exercise = await createdExercise(exercisesRepository);
      await repository.addExercise("user-1", template.id, {
        exerciseId: exercise.id,
      });
      const [templateExercise] = (await repository.findVisibleForUser(
        "user-1",
        template.id,
      ))!.templateExercises;

      const result = await repository.removeExercise(
        "user-1",
        template.id,
        templateExercise.id,
      );

      expect(result).toEqual({ outcome: "removed", forkedTemplateId: null });
      const detail = await repository.findVisibleForUser("user-1", template.id);
      expect(detail?.templateExercises).toEqual([]);
    });

    it("swaps positions when moving an exercise down", async () => {
      const template = await repository.create("user-1", "Push Day");
      const bench = await createdExercise(exercisesRepository, "Bench Press");
      const squat = await createdExercise(exercisesRepository, "Squat");
      await repository.addExercise("user-1", template.id, {
        exerciseId: bench.id,
      });
      await repository.addExercise("user-1", template.id, {
        exerciseId: squat.id,
      });
      const [first] = (await repository.findVisibleForUser(
        "user-1",
        template.id,
      ))!.templateExercises;

      const result = await repository.moveExercise(
        "user-1",
        template.id,
        first.id,
        "down",
      );

      expect(result).toEqual({ outcome: "moved", forkedTemplateId: null });
      const detail = await repository.findVisibleForUser("user-1", template.id);
      expect(detail?.templateExercises.map((te) => te.exercise.name)).toEqual([
        "Squat",
        "Bench Press",
      ]);
    });

    it("returns no-op when moving the first exercise up", async () => {
      const template = await repository.create("user-1", "Push Day");
      const exercise = await createdExercise(exercisesRepository);
      await repository.addExercise("user-1", template.id, {
        exerciseId: exercise.id,
      });
      const [only] = (await repository.findVisibleForUser(
        "user-1",
        template.id,
      ))!.templateExercises;

      const result = await repository.moveExercise(
        "user-1",
        template.id,
        only.id,
        "up",
      );

      expect(result).toEqual({ outcome: "no-op", forkedTemplateId: null });
    });
  });

  describe("revert", () => {
    it("returns not-found for a missing template", async () => {
      expect(await repository.revert("user-1", "missing")).toEqual({
        outcome: "not-found",
      });
    });

    it("returns nothing-to-revert for a template that isn't a fork", async () => {
      const template = await repository.create("user-1", "Push Day");

      expect(await repository.revert("user-1", template.id)).toEqual({
        outcome: "nothing-to-revert",
      });
    });
  });
});
