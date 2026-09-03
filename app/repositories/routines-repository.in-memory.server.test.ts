import { beforeEach, describe, expect, it } from "vitest";

import { InMemoryEquipmentRepository } from "./equipment-repository.in-memory.server";
import { InMemoryExercisesRepository } from "./exercises-repository.in-memory.server";
import { InMemoryRoutinesRepository } from "./routines-repository.in-memory.server";
import type { TemplatesRepository } from "./templates-repository";
import { InMemoryTemplatesRepository } from "./templates-repository.in-memory.server";

async function createdTemplate(
  templatesRepository: TemplatesRepository,
  name = "Push Day",
) {
  return templatesRepository.create("user-1", name);
}

describe("InMemoryRoutinesRepository", () => {
  let templatesRepository: TemplatesRepository;
  let repository: InMemoryRoutinesRepository;

  beforeEach(() => {
    templatesRepository = new InMemoryTemplatesRepository(
      new InMemoryExercisesRepository(new InMemoryEquipmentRepository()),
    );
    repository = new InMemoryRoutinesRepository(templatesRepository);
  });

  describe("create / listForUser / findVisibleForUser", () => {
    it("creates an owned routine with no slots", async () => {
      const routine = await repository.create("user-1", "PPL", "2026-09-01");

      const rows = await repository.listForUser("user-1", true);
      expect(rows).toEqual([
        expect.objectContaining({ id: routine.id, slots: [] }),
      ]);
    });

    it("excludes another user's routines", async () => {
      await repository.create("user-1", "PPL", "2026-09-01");

      expect(await repository.listForUser("user-2", true)).toEqual([]);
    });

    it("findVisibleForUser returns null for an unknown or inaccessible routine", async () => {
      const routine = await repository.create("user-1", "PPL", "2026-09-01");

      expect(await repository.findVisibleForUser("user-1", "missing")).toBeNull();
      expect(
        await repository.findVisibleForUser("user-2", routine.id),
      ).toBeNull();
    });

    it("findVisibleForUser joins each slot with its template, or null for rest", async () => {
      const routine = await repository.create("user-1", "PPL", "2026-09-01");
      const template = await createdTemplate(templatesRepository);
      await repository.addSlot("user-1", routine.id, template.id);
      await repository.addSlot("user-1", routine.id, null);

      const detail = await repository.findVisibleForUser("user-1", routine.id);

      expect(detail?.slots).toEqual([
        expect.objectContaining({ template: expect.objectContaining({ id: template.id }) }),
        expect.objectContaining({ template: null }),
      ]);
    });
  });

  describe("findActiveForUser", () => {
    it("returns null when the user has no active routine", async () => {
      await repository.create("user-1", "PPL", "2026-09-01");

      expect(await repository.findActiveForUser("user-1")).toBeNull();
    });

    it("returns the user's active routine", async () => {
      const routine = await repository.create("user-1", "PPL", "2026-09-01");
      await repository.activate("user-1", routine.id);

      const active = await repository.findActiveForUser("user-1");

      expect(active?.id).toBe(routine.id);
    });
  });

  describe("delete", () => {
    it("returns not-found for a missing routine", async () => {
      expect(await repository.delete("user-1", "missing")).toEqual({
        outcome: "not-found",
      });
    });

    it("deletes an owned routine", async () => {
      const routine = await repository.create("user-1", "PPL", "2026-09-01");

      expect(await repository.delete("user-1", routine.id)).toEqual({
        outcome: "deleted",
      });
      expect(
        await repository.findVisibleForUser("user-1", routine.id),
      ).toBeNull();
    });
  });

  describe("rename / reanchor / activate / deactivate", () => {
    it("renames an owned routine", async () => {
      const routine = await repository.create("user-1", "PPL", "2026-09-01");

      const result = await repository.rename("user-1", routine.id, "Upper/Lower");

      expect(result).toEqual({ outcome: "renamed", forkedRoutineId: null });
      const detail = await repository.findVisibleForUser("user-1", routine.id);
      expect(detail?.name).toBe("Upper/Lower");
    });

    it("reanchors an owned routine", async () => {
      const routine = await repository.create("user-1", "PPL", "2026-09-01");

      const result = await repository.reanchor(
        "user-1",
        routine.id,
        "2026-09-10",
      );

      expect(result).toEqual({
        outcome: "reanchored",
        forkedRoutineId: null,
      });
      const detail = await repository.findVisibleForUser("user-1", routine.id);
      expect(detail?.anchorDate).toBe("2026-09-10");
    });

    it("activating one routine deactivates the user's other active routine", async () => {
      const first = await repository.create("user-1", "PPL", "2026-09-01");
      const second = await repository.create("user-1", "Upper/Lower", "2026-09-01");
      await repository.activate("user-1", first.id);

      const result = await repository.activate("user-1", second.id);

      expect(result).toEqual({ outcome: "activated", forkedRoutineId: null });
      const firstDetail = await repository.findVisibleForUser("user-1", first.id);
      const secondDetail = await repository.findVisibleForUser("user-1", second.id);
      expect(firstDetail?.isActive).toBe(false);
      expect(secondDetail?.isActive).toBe(true);
    });

    it("does not affect other users' active routines", async () => {
      const otherUsersRoutine = await repository.create(
        "user-2",
        "PPL",
        "2026-09-01",
      );
      await repository.activate("user-2", otherUsersRoutine.id);
      const routine = await repository.create("user-1", "PPL", "2026-09-01");

      await repository.activate("user-1", routine.id);

      const otherDetail = await repository.findVisibleForUser(
        "user-2",
        otherUsersRoutine.id,
      );
      expect(otherDetail?.isActive).toBe(true);
    });

    it("deactivates an owned routine", async () => {
      const routine = await repository.create("user-1", "PPL", "2026-09-01");
      await repository.activate("user-1", routine.id);

      const result = await repository.deactivate("user-1", routine.id);

      expect(result).toEqual({
        outcome: "deactivated",
        forkedRoutineId: null,
      });
      const detail = await repository.findVisibleForUser("user-1", routine.id);
      expect(detail?.isActive).toBe(false);
    });
  });

  describe("addSlot / removeSlot / moveSlot", () => {
    it("adds slots at increasing positions", async () => {
      const routine = await repository.create("user-1", "PPL", "2026-09-01");

      await repository.addSlot("user-1", routine.id, null);
      await repository.addSlot("user-1", routine.id, null);

      const detail = await repository.findVisibleForUser("user-1", routine.id);
      expect(detail?.slots.map((s) => s.position)).toEqual([0, 1]);
    });

    it("removes a slot and shifts later slots down", async () => {
      const routine = await repository.create("user-1", "PPL", "2026-09-01");
      await repository.addSlot("user-1", routine.id, null);
      await repository.addSlot("user-1", routine.id, null);
      await repository.addSlot("user-1", routine.id, null);
      const first = (await repository.findVisibleForUser("user-1", routine.id))!
        .slots[0];

      const result = await repository.removeSlot(
        "user-1",
        routine.id,
        first.id,
      );

      expect(result).toEqual({ outcome: "removed", forkedRoutineId: null });
      const detail = await repository.findVisibleForUser("user-1", routine.id);
      expect(detail?.slots.map((s) => s.position)).toEqual([0, 1]);
    });

    it("swaps positions when moving a slot down", async () => {
      const routine = await repository.create("user-1", "PPL", "2026-09-01");
      const pushTemplate = await createdTemplate(templatesRepository, "Push Day");
      const pullTemplate = await createdTemplate(templatesRepository, "Pull Day");
      await repository.addSlot("user-1", routine.id, pushTemplate.id);
      await repository.addSlot("user-1", routine.id, pullTemplate.id);
      const first = (await repository.findVisibleForUser("user-1", routine.id))!
        .slots[0];

      const result = await repository.moveSlot(
        "user-1",
        routine.id,
        first.id,
        "down",
      );

      expect(result).toEqual({ outcome: "moved", forkedRoutineId: null });
      const detail = await repository.findVisibleForUser("user-1", routine.id);
      expect(detail?.slots.map((s) => s.template?.name)).toEqual([
        "Pull Day",
        "Push Day",
      ]);
    });

    it("returns no-op when moving the first slot up", async () => {
      const routine = await repository.create("user-1", "PPL", "2026-09-01");
      await repository.addSlot("user-1", routine.id, null);
      const only = (await repository.findVisibleForUser("user-1", routine.id))!
        .slots[0];

      const result = await repository.moveSlot(
        "user-1",
        routine.id,
        only.id,
        "up",
      );

      expect(result).toEqual({ outcome: "no-op", forkedRoutineId: null });
    });
  });

  describe("revert", () => {
    it("returns not-found for a missing routine", async () => {
      expect(await repository.revert("user-1", "missing")).toEqual({
        outcome: "not-found",
      });
    });

    it("returns nothing-to-revert for a routine that isn't a fork", async () => {
      const routine = await repository.create("user-1", "PPL", "2026-09-01");

      expect(await repository.revert("user-1", routine.id)).toEqual({
        outcome: "nothing-to-revert",
      });
    });
  });
});
