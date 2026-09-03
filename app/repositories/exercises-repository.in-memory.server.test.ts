import { beforeEach, describe, expect, it } from "vitest";

import type { EquipmentRepository } from "./equipment-repository";
import { InMemoryEquipmentRepository } from "./equipment-repository.in-memory.server";
import { InMemoryExercisesRepository } from "./exercises-repository.in-memory.server";

describe("InMemoryExercisesRepository", () => {
  let equipmentRepository: EquipmentRepository;
  let repository: InMemoryExercisesRepository;

  beforeEach(() => {
    equipmentRepository = new InMemoryEquipmentRepository();
    repository = new InMemoryExercisesRepository(equipmentRepository);
  });

  describe("findById", () => {
    it("returns null for an unknown exercise", async () => {
      expect(await repository.findById("missing")).toBeNull();
    });

    it("finds a created exercise by id", async () => {
      const created = await repository.create("user-1", {
        name: "Bench Press",
        exerciseType: "strength",
      });
      if (created.outcome !== "created") throw new Error("setup failed");

      expect(await repository.findById(created.exercise.id)).toEqual(
        created.exercise,
      );
    });
  });

  describe("create / listWithEquipmentForUser", () => {
    it("creates an owned exercise with no equipment links", async () => {
      const result = await repository.create("user-1", {
        name: "Bench Press",
        exerciseType: "strength",
      });

      expect(result.outcome).toBe("created");
      const rows = await repository.listWithEquipmentForUser("user-1", true);
      expect(rows).toEqual([
        expect.objectContaining({ name: "Bench Press", equipmentLinks: [] }),
      ]);
    });

    it("rejects a duplicate name for the same user", async () => {
      await repository.create("user-1", {
        name: "Bench Press",
        exerciseType: "strength",
      });

      const result = await repository.create("user-1", {
        name: "Bench Press",
        exerciseType: "strength",
      });

      expect(result).toEqual({ outcome: "duplicate-name" });
    });

    it("excludes another user's exercises", async () => {
      await repository.create("user-1", {
        name: "Bench Press",
        exerciseType: "strength",
      });

      const rows = await repository.listWithEquipmentForUser("user-2", true);

      expect(rows).toEqual([]);
    });
  });

  describe("update", () => {
    it("returns not-found for an unknown exercise", async () => {
      const result = await repository.update("user-1", "missing", {
        name: "New Name",
        exerciseType: "strength",
      });

      expect(result).toEqual({ outcome: "not-found" });
    });

    it("updates an owned exercise's fields", async () => {
      const created = await repository.create("user-1", {
        name: "Bench Press",
        exerciseType: "strength",
      });
      if (created.outcome !== "created") throw new Error("setup failed");

      const result = await repository.update("user-1", created.exercise.id, {
        name: "Incline Bench Press",
        exerciseType: "strength",
        muscleGroup: "chest",
      });

      expect(result).toEqual({ outcome: "updated" });
      const [row] = await repository.listWithEquipmentForUser("user-1", true);
      expect(row).toMatchObject({
        name: "Incline Bench Press",
        muscleGroup: "chest",
      });
    });

    it("rejects a rename that collides with another owned exercise", async () => {
      await repository.create("user-1", {
        name: "Bench Press",
        exerciseType: "strength",
      });
      const squat = await repository.create("user-1", {
        name: "Squat",
        exerciseType: "strength",
      });
      if (squat.outcome !== "created") throw new Error("setup failed");

      const result = await repository.update("user-1", squat.exercise.id, {
        name: "Bench Press",
        exerciseType: "strength",
      });

      expect(result).toEqual({ outcome: "duplicate-name" });
    });
  });

  describe("toggleEquipment", () => {
    it("does nothing for an unknown exercise", async () => {
      await repository.toggleEquipment("user-1", "missing", "equip-1", true);
      const rows = await repository.listWithEquipmentForUser("user-1", true);
      expect(rows).toEqual([]);
    });

    it("links and unlinks equipment on an owned exercise", async () => {
      const created = await repository.create("user-1", {
        name: "Bench Press",
        exerciseType: "strength",
      });
      if (created.outcome !== "created") throw new Error("setup failed");
      await equipmentRepository.add("user-1", "Barbell");
      const [equipment] = await equipmentRepository.listForUser("user-1", true);

      await repository.toggleEquipment(
        "user-1",
        created.exercise.id,
        equipment.id,
        true,
      );
      let [row] = await repository.listWithEquipmentForUser("user-1", true);
      expect(row.equipmentLinks).toEqual([{ equipment }]);

      await repository.toggleEquipment(
        "user-1",
        created.exercise.id,
        equipment.id,
        false,
      );
      [row] = await repository.listWithEquipmentForUser("user-1", true);
      expect(row.equipmentLinks).toEqual([]);
    });
  });

  describe("revert", () => {
    it("returns nothing-to-revert for an exercise that isn't a fork", async () => {
      const created = await repository.create("user-1", {
        name: "Bench Press",
        exerciseType: "strength",
      });
      if (created.outcome !== "created") throw new Error("setup failed");

      const result = await repository.revert("user-1", created.exercise.id);

      expect(result).toEqual({ outcome: "nothing-to-revert" });
    });

    it("returns nothing-to-revert for an unknown exercise", async () => {
      const result = await repository.revert("user-1", "missing");

      expect(result).toEqual({ outcome: "nothing-to-revert" });
    });
  });
});
