import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Transaction } from "~/db/index.server";
import type { Routine, RoutineSlot } from "~/db/schema";
import { dbChain } from "~/test/db-chain";
import { mock } from "~/test/mock";

const {
  selectMock,
  routinesFindFirstMock,
  routinesFindManyMock,
  insertMock,
  updateMock,
  deleteMock,
  transactionMock,
} = vi.hoisted(() => ({
  selectMock: vi.fn(),
  routinesFindFirstMock: vi.fn(),
  routinesFindManyMock: vi.fn(),
  insertMock: vi.fn(),
  updateMock: vi.fn(),
  deleteMock: vi.fn(),
  transactionMock: vi.fn(),
}));

vi.mock("~/db/index.server", () => ({
  db: mock<typeof import("~/db/index.server").db>({
    // sampleOrOwnRoutinesWhere builds a "not yet forked" subquery via
    // db.select(...) even though nothing here ever awaits it directly.
    select: selectMock,
    query: mock<typeof import("~/db/index.server").db.query>({
      routines: mock({
        findFirst: routinesFindFirstMock,
        findMany: routinesFindManyMock,
      }),
    }),
    insert: insertMock,
    update: updateMock,
    delete: deleteMock,
    transaction: transactionMock,
  }),
}));

const { DrizzleRoutinesRepository } = await import(
  "./routines-repository.drizzle.server"
);

type Tx = Transaction;
type LoadedRoutine = Routine & { slots: RoutineSlot[] };

function tx(opts: {
  routinesFindFirst: (LoadedRoutine | undefined)[];
  insert?: ReturnType<typeof vi.fn>;
  update?: ReturnType<typeof vi.fn>;
  delete?: ReturnType<typeof vi.fn>;
}): Tx {
  const findFirst = vi.fn();
  for (const value of opts.routinesFindFirst) {
    findFirst.mockResolvedValueOnce(value);
  }
  return mock<Tx>({
    query: mock<Tx["query"]>({
      routines: mock<Tx["query"]["routines"]>({ findFirst }),
    }),
    insert: opts.insert ?? vi.fn().mockReturnValue(dbChain([])),
    update: opts.update ?? vi.fn(() => dbChain(undefined)),
    delete: opts.delete ?? vi.fn(() => dbChain(undefined)),
  });
}

function runInTx(t: Tx) {
  transactionMock.mockImplementation((cb: (tx: Tx) => unknown) => cb(t));
  return new DrizzleRoutinesRepository();
}

describe("DrizzleRoutinesRepository", () => {
  beforeEach(() => {
    selectMock.mockReset().mockReturnValue(dbChain([]));
    routinesFindFirstMock.mockReset();
    routinesFindManyMock.mockReset();
    insertMock.mockReset();
    updateMock.mockReset();
    deleteMock.mockReset();
    transactionMock.mockReset();
  });

  it("listForUser passes through the relational query result", async () => {
    const rows = [mock<Routine>({ id: "r-1" })];
    routinesFindManyMock.mockResolvedValue(rows);
    const repository = new DrizzleRoutinesRepository();

    expect(await repository.listForUser("user-1", true)).toBe(rows);
  });

  it("findVisibleForUser passes through the relational query result", async () => {
    const routine = mock<Routine>({ id: "r-1" });
    routinesFindFirstMock.mockResolvedValue(routine);
    const repository = new DrizzleRoutinesRepository();

    expect(await repository.findVisibleForUser("user-1", "r-1")).toBe(
      routine,
    );
  });

  it("findVisibleForUser returns null when nothing matches", async () => {
    routinesFindFirstMock.mockResolvedValue(undefined);
    const repository = new DrizzleRoutinesRepository();

    expect(
      await repository.findVisibleForUser("user-1", "missing"),
    ).toBeNull();
  });

  it("findActiveForUser returns the user's active routine", async () => {
    const routine = mock<Routine>({ id: "r-1", isActive: true });
    routinesFindFirstMock.mockResolvedValue(routine);
    const repository = new DrizzleRoutinesRepository();

    expect(await repository.findActiveForUser("user-1")).toBe(routine);
  });

  it("findActiveForUser returns null when no routine is active", async () => {
    routinesFindFirstMock.mockResolvedValue(undefined);
    const repository = new DrizzleRoutinesRepository();

    expect(await repository.findActiveForUser("user-1")).toBeNull();
  });

  it("create inserts and returns the new row", async () => {
    const routine = mock<Routine>({ id: "r-1" });
    insertMock.mockReturnValueOnce(dbChain([routine]));
    const repository = new DrizzleRoutinesRepository();

    expect(
      await repository.create("user-1", "PPL", "2026-09-01"),
    ).toBe(routine);
  });

  describe("delete", () => {
    it("returns not-found for a missing/invisible routine", async () => {
      routinesFindFirstMock.mockResolvedValue(undefined);
      const repository = new DrizzleRoutinesRepository();

      expect(await repository.delete("user-1", "missing")).toEqual({
        outcome: "not-found",
      });
    });

    it("refuses to delete a sample routine", async () => {
      routinesFindFirstMock.mockResolvedValue(
        mock<Routine>({ id: "r-1", userId: null }),
      );
      const repository = new DrizzleRoutinesRepository();

      expect(await repository.delete("user-1", "r-1")).toEqual({
        outcome: "sample-routine",
      });
      expect(deleteMock).not.toHaveBeenCalled();
    });

    it("deletes an owned routine", async () => {
      routinesFindFirstMock.mockResolvedValue(
        mock<Routine>({ id: "r-1", userId: "user-1" }),
      );
      deleteMock.mockReturnValue(dbChain(undefined));
      const repository = new DrizzleRoutinesRepository();

      expect(await repository.delete("user-1", "r-1")).toEqual({
        outcome: "deleted",
      });
    });
  });

  describe("revert", () => {
    it("returns not-found for a missing/invisible routine", async () => {
      routinesFindFirstMock.mockResolvedValue(undefined);
      const repository = new DrizzleRoutinesRepository();

      expect(await repository.revert("user-1", "missing")).toEqual({
        outcome: "not-found",
      });
    });

    it("returns nothing-to-revert for a routine that isn't a fork", async () => {
      routinesFindFirstMock.mockResolvedValue(
        mock<Routine>({ id: "r-1", userId: "user-1", forkedFromId: null }),
      );
      const repository = new DrizzleRoutinesRepository();

      expect(await repository.revert("user-1", "r-1")).toEqual({
        outcome: "nothing-to-revert",
      });
    });

    it("deletes the fork and reports its sample origin", async () => {
      routinesFindFirstMock.mockResolvedValue(
        mock<Routine>({
          id: "r-1",
          userId: "user-1",
          forkedFromId: "sample-1",
        }),
      );
      deleteMock.mockReturnValue(dbChain(undefined));
      const repository = new DrizzleRoutinesRepository();

      expect(await repository.revert("user-1", "r-1")).toEqual({
        outcome: "reverted",
        forkedFromId: "sample-1",
      });
    });
  });

  describe("rename", () => {
    it("returns not-found for a missing/invisible routine", async () => {
      const repository = runInTx(tx({ routinesFindFirst: [undefined] }));

      expect(await repository.rename("user-1", "missing", "New Name")).toEqual(
        { outcome: "not-found" },
      );
    });

    it("renames an owned routine directly", async () => {
      const routine = mock<LoadedRoutine>({
        id: "r-1",
        userId: "user-1",
        slots: [],
      });
      const update = vi.fn(() => dbChain(undefined));
      const repository = runInTx(tx({ routinesFindFirst: [routine], update }));

      const result = await repository.rename("user-1", "r-1", "New Name");

      expect(result).toEqual({ outcome: "renamed", forkedRoutineId: null });
      expect(update).toHaveBeenCalledTimes(1);
    });

    it("forks a sample routine (with its slots) before renaming it", async () => {
      const sample = mock<LoadedRoutine>({
        id: "sample-1",
        userId: null,
        slots: [mock<RoutineSlot>({ id: "slot-1", position: 0 })],
      });
      const fork = mock<Routine>({ id: "fork-1", userId: "user-1" });
      const forkedSlot = mock<RoutineSlot>({ id: "forked-slot-1", position: 0 });
      const insert = vi
        .fn()
        .mockReturnValueOnce(dbChain([fork]))
        .mockReturnValueOnce(dbChain([forkedSlot]));
      const update = vi.fn(() => dbChain(undefined));
      const repository = runInTx(
        tx({
          // 1: the routine itself (sample); 2: no existing fork yet.
          routinesFindFirst: [sample, undefined],
          insert,
          update,
        }),
      );

      const result = await repository.rename(
        "user-1",
        "sample-1",
        "New Name",
      );

      expect(result).toEqual({
        outcome: "renamed",
        forkedRoutineId: "fork-1",
      });
      expect(insert).toHaveBeenCalledTimes(2);
    });
  });

  describe("reanchor", () => {
    it("updates an owned routine's anchor date", async () => {
      const routine = mock<LoadedRoutine>({
        id: "r-1",
        userId: "user-1",
        slots: [],
      });
      const update = vi.fn(() => dbChain(undefined));
      const repository = runInTx(tx({ routinesFindFirst: [routine], update }));

      const result = await repository.reanchor(
        "user-1",
        "r-1",
        "2026-09-05",
      );

      expect(result).toEqual({
        outcome: "reanchored",
        forkedRoutineId: null,
      });
    });
  });

  describe("activate / deactivate", () => {
    it("deactivates every other owned routine, then activates this one", async () => {
      const routine = mock<LoadedRoutine>({
        id: "r-1",
        userId: "user-1",
        slots: [],
      });
      const update = vi.fn(() => dbChain(undefined));
      const repository = runInTx(tx({ routinesFindFirst: [routine], update }));

      const result = await repository.activate("user-1", "r-1");

      expect(result).toEqual({ outcome: "activated", forkedRoutineId: null });
      expect(update).toHaveBeenCalledTimes(2);
    });

    it("deactivates an owned routine", async () => {
      const routine = mock<LoadedRoutine>({
        id: "r-1",
        userId: "user-1",
        slots: [],
      });
      const update = vi.fn(() => dbChain(undefined));
      const repository = runInTx(tx({ routinesFindFirst: [routine], update }));

      const result = await repository.deactivate("user-1", "r-1");

      expect(result).toEqual({
        outcome: "deactivated",
        forkedRoutineId: null,
      });
      expect(update).toHaveBeenCalledTimes(1);
    });
  });

  describe("addSlot", () => {
    it("adds a slot at the next position on an owned routine", async () => {
      const routine = mock<LoadedRoutine>({
        id: "r-1",
        userId: "user-1",
        slots: [mock<RoutineSlot>({ id: "slot-1", position: 0 })],
      });
      const insert = vi.fn().mockReturnValue(dbChain(undefined));
      const repository = runInTx(tx({ routinesFindFirst: [routine], insert }));

      const result = await repository.addSlot("user-1", "r-1", null);

      expect(result).toEqual({ outcome: "added", forkedRoutineId: null });
      expect(insert).toHaveBeenCalledTimes(1);
    });

    it("forks a sample routine before adding a slot to it", async () => {
      const sample = mock<LoadedRoutine>({
        id: "sample-1",
        userId: null,
        slots: [],
      });
      const fork = mock<Routine>({ id: "fork-1", userId: "user-1" });
      const insert = vi
        .fn()
        .mockReturnValueOnce(dbChain([fork]))
        .mockReturnValueOnce(dbChain(undefined));
      const repository = runInTx(
        tx({ routinesFindFirst: [sample, undefined], insert }),
      );

      const result = await repository.addSlot("user-1", "sample-1", null);

      expect(result).toEqual({ outcome: "added", forkedRoutineId: "fork-1" });
      expect(insert).toHaveBeenCalledTimes(2);
    });
  });

  describe("removeSlot", () => {
    it("removes a slot and shifts later slots down on an owned routine", async () => {
      const routine = mock<LoadedRoutine>({
        id: "r-1",
        userId: "user-1",
        slots: [
          mock<RoutineSlot>({ id: "slot-1", position: 0 }),
          mock<RoutineSlot>({ id: "slot-2", position: 1 }),
        ],
      });
      const deleteFn = vi.fn(() => dbChain(undefined));
      const update = vi.fn(() => dbChain(undefined));
      const repository = runInTx(
        tx({ routinesFindFirst: [routine], delete: deleteFn, update }),
      );

      const result = await repository.removeSlot("user-1", "r-1", "slot-1");

      expect(result).toEqual({ outcome: "removed", forkedRoutineId: null });
      expect(deleteFn).toHaveBeenCalledTimes(1);
      expect(update).toHaveBeenCalledTimes(1);
    });
  });

  describe("moveSlot", () => {
    it("returns no-op when moving the first slot up", async () => {
      const routine = mock<LoadedRoutine>({
        id: "r-1",
        userId: "user-1",
        slots: [
          mock<RoutineSlot>({ id: "slot-1", position: 0 }),
          mock<RoutineSlot>({ id: "slot-2", position: 1 }),
        ],
      });
      const repository = runInTx(tx({ routinesFindFirst: [routine] }));

      const result = await repository.moveSlot(
        "user-1",
        "r-1",
        "slot-1",
        "up",
      );

      expect(result).toEqual({ outcome: "no-op", forkedRoutineId: null });
    });

    it("swaps positions when moving down", async () => {
      const routine = mock<LoadedRoutine>({
        id: "r-1",
        userId: "user-1",
        slots: [
          mock<RoutineSlot>({ id: "slot-1", position: 0 }),
          mock<RoutineSlot>({ id: "slot-2", position: 1 }),
        ],
      });
      const update = vi.fn(() => dbChain(undefined));
      const repository = runInTx(tx({ routinesFindFirst: [routine], update }));

      const result = await repository.moveSlot(
        "user-1",
        "r-1",
        "slot-1",
        "down",
      );

      expect(result).toEqual({ outcome: "moved", forkedRoutineId: null });
      expect(update).toHaveBeenCalledTimes(3);
    });
  });
});
