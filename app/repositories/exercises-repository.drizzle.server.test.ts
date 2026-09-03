import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Transaction } from "~/db/index.server";
import type { Exercise } from "~/db/schema";
import { dbChain } from "~/test/db-chain";
import { mock } from "~/test/mock";

const {
  selectMock,
  findFirstMock,
  findManyMock,
  insertMock,
  deleteMock,
  transactionMock,
} = vi.hoisted(() => ({
  selectMock: vi.fn(),
  findFirstMock: vi.fn(),
  findManyMock: vi.fn(),
  insertMock: vi.fn(),
  deleteMock: vi.fn(),
  transactionMock: vi.fn(),
}));

vi.mock("~/db/index.server", () => ({
  db: mock<typeof import("~/db/index.server").db>({
    // sampleOrOwnExercisesWhere builds a "not yet forked" subquery via
    // db.select(...) even though nothing here ever awaits it directly.
    select: selectMock,
    query: mock<typeof import("~/db/index.server").db.query>({
      exercises: mock({ findFirst: findFirstMock, findMany: findManyMock }),
    }),
    insert: insertMock,
    delete: deleteMock,
    transaction: transactionMock,
  }),
}));

const { DrizzleExercisesRepository } = await import(
  "./exercises-repository.drizzle.server"
);

type Tx = Transaction;

function tx(opts: {
  exercisesFindFirst: (Exercise | undefined)[];
  equipmentLinks?: { equipmentId: string }[];
  insert?: ReturnType<typeof vi.fn>;
  update?: ReturnType<typeof vi.fn>;
}): Tx {
  const findFirst = vi.fn();
  for (const value of opts.exercisesFindFirst) {
    findFirst.mockResolvedValueOnce(value);
  }
  return mock<Tx>({
    query: mock<Tx["query"]>({
      exercises: mock<Tx["query"]["exercises"]>({ findFirst }),
      exerciseEquipment: mock<Tx["query"]["exerciseEquipment"]>({
        findMany: vi.fn().mockResolvedValue(opts.equipmentLinks ?? []),
      }),
    }),
    insert: opts.insert ?? vi.fn().mockReturnValue(dbChain([])),
    update: opts.update ?? vi.fn(() => dbChain(undefined)),
  });
}

describe("DrizzleExercisesRepository", () => {
  beforeEach(() => {
    selectMock.mockReset().mockReturnValue(dbChain([]));
    findFirstMock.mockReset();
    findManyMock.mockReset();
    insertMock.mockReset();
    deleteMock.mockReset();
    transactionMock.mockReset();
  });

  describe("listWithEquipmentForUser", () => {
    it("passes through the relational query result", async () => {
      const rows = [mock<Exercise>({ id: "ex-1" })];
      findManyMock.mockResolvedValue(rows);
      const repository = new DrizzleExercisesRepository();

      const result = await repository.listWithEquipmentForUser("user-1", true);

      expect(result).toBe(rows);
    });
  });

  describe("findById", () => {
    it("returns null when no row matches", async () => {
      selectMock.mockReturnValueOnce(dbChain([]));
      const repository = new DrizzleExercisesRepository();

      expect(await repository.findById("missing")).toBeNull();
    });

    it("returns the matching row", async () => {
      const row = mock<Exercise>({ id: "ex-1" });
      selectMock.mockReturnValueOnce(dbChain([row]));
      const repository = new DrizzleExercisesRepository();

      expect(await repository.findById("ex-1")).toBe(row);
    });
  });

  describe("create", () => {
    it("returns duplicate-name when the user already has an exercise with that name", async () => {
      findFirstMock.mockResolvedValue(mock<Exercise>({ id: "existing" }));
      const repository = new DrizzleExercisesRepository();

      const result = await repository.create("user-1", {
        name: "Bench Press",
        exerciseType: "strength",
      });

      expect(result).toEqual({ outcome: "duplicate-name" });
    });

    it("inserts and returns the created exercise", async () => {
      findFirstMock.mockResolvedValue(undefined);
      const created = mock<Exercise>({ id: "ex-1" });
      insertMock.mockReturnValueOnce(dbChain([created]));
      const repository = new DrizzleExercisesRepository();

      const result = await repository.create("user-1", {
        name: "Bench Press",
        exerciseType: "strength",
      });

      expect(result).toEqual({ outcome: "created", exercise: created });
    });
  });

  describe("update", () => {
    function runUpdate(t: Tx) {
      transactionMock.mockImplementation((cb: (tx: Tx) => unknown) => cb(t));
      const repository = new DrizzleExercisesRepository();
      return repository.update("user-1", "ex-1", {
        name: "New Name",
        exerciseType: "strength",
      });
    }

    it("returns not-found when the exercise doesn't exist", async () => {
      const result = await runUpdate(tx({ exercisesFindFirst: [undefined] }));

      expect(result).toEqual({ outcome: "not-found" });
    });

    it("returns duplicate-name for an owned exercise with a name conflict", async () => {
      const exercise = mock<Exercise>({ id: "ex-1", userId: "user-1" });
      const conflict = mock<Exercise>({ id: "ex-2" });
      const result = await runUpdate(
        tx({ exercisesFindFirst: [exercise, conflict] }),
      );

      expect(result).toEqual({ outcome: "duplicate-name" });
    });

    it("updates an already-owned exercise directly, without forking", async () => {
      const exercise = mock<Exercise>({ id: "ex-1", userId: "user-1" });
      const update = vi.fn(() => dbChain(undefined));
      const result = await runUpdate(
        tx({ exercisesFindFirst: [exercise, undefined], update }),
      );

      expect(result).toEqual({ outcome: "updated" });
      expect(update).toHaveBeenCalledTimes(1);
    });

    it("forks a sample exercise before updating it", async () => {
      const sample = mock<Exercise>({ id: "sample-1", userId: null });
      const fork = mock<Exercise>({ id: "fork-1", userId: "user-1" });
      const insert = vi.fn().mockReturnValueOnce(dbChain([fork]));
      const update = vi.fn(() => dbChain(undefined));
      const result = await runUpdate(
        tx({
          // 1: the exercise itself (sample); 2: no existing fork yet;
          // 3: no name conflict.
          exercisesFindFirst: [sample, undefined, undefined],
          insert,
          update,
        }),
      );

      expect(result).toEqual({ outcome: "updated" });
      expect(insert).toHaveBeenCalledTimes(1);
      expect(update).toHaveBeenCalledTimes(1);
    });

    it("reuses an existing fork instead of creating a new one", async () => {
      const sample = mock<Exercise>({ id: "sample-1", userId: null });
      const existingFork = mock<Exercise>({ id: "fork-1", userId: "user-1" });
      const insert = vi.fn();
      const update = vi.fn(() => dbChain(undefined));
      const result = await runUpdate(
        tx({
          exercisesFindFirst: [sample, existingFork, undefined],
          insert,
          update,
        }),
      );

      expect(result).toEqual({ outcome: "updated" });
      expect(insert).not.toHaveBeenCalled();
    });
  });

  describe("toggleEquipment", () => {
    function runToggle(t: Tx, checked: boolean) {
      transactionMock.mockImplementation((cb: (tx: Tx) => unknown) => cb(t));
      const repository = new DrizzleExercisesRepository();
      return repository.toggleEquipment("user-1", "ex-1", "equip-1", checked);
    }

    it("does nothing when the exercise no longer exists", async () => {
      const insert = vi.fn();
      await runToggle(tx({ exercisesFindFirst: [undefined], insert }), true);

      expect(insert).not.toHaveBeenCalled();
    });

    it("links equipment directly on an already-owned exercise", async () => {
      const exercise = mock<Exercise>({ id: "ex-1", userId: "user-1" });
      const insert = vi.fn().mockReturnValue(dbChain(undefined));
      await runToggle(tx({ exercisesFindFirst: [exercise], insert }), true);

      expect(insert).toHaveBeenCalledTimes(1);
    });

    it("forks a sample exercise before linking equipment", async () => {
      const sample = mock<Exercise>({ id: "sample-1", userId: null });
      const fork = mock<Exercise>({ id: "fork-1", userId: "user-1" });
      const insert = vi
        .fn()
        .mockReturnValueOnce(dbChain([fork])) // the fork itself
        .mockReturnValueOnce(dbChain(undefined)); // the equipment link
      await runToggle(
        tx({ exercisesFindFirst: [sample, undefined], insert }),
        true,
      );

      expect(insert).toHaveBeenCalledTimes(2);
    });
  });

  describe("revert", () => {
    it("returns nothing-to-revert when the exercise isn't a fork", async () => {
      findFirstMock.mockResolvedValue(
        mock<Exercise>({ id: "ex-1", forkedFromId: null }),
      );
      const repository = new DrizzleExercisesRepository();

      const result = await repository.revert("user-1", "ex-1");

      expect(result).toEqual({ outcome: "nothing-to-revert" });
      expect(deleteMock).not.toHaveBeenCalled();
    });

    it("deletes the fork and reports reverted", async () => {
      findFirstMock.mockResolvedValue(
        mock<Exercise>({ id: "ex-1", forkedFromId: "sample-1" }),
      );
      deleteMock.mockReturnValue(dbChain(undefined));
      const repository = new DrizzleExercisesRepository();

      const result = await repository.revert("user-1", "ex-1");

      expect(result).toEqual({ outcome: "reverted" });
    });

    it("reports in-use when the delete is rejected by a foreign key", async () => {
      findFirstMock.mockResolvedValue(
        mock<Exercise>({ id: "ex-1", forkedFromId: "sample-1" }),
      );
      deleteMock.mockImplementation(() => {
        throw new Error("foreign key violation");
      });
      const repository = new DrizzleExercisesRepository();

      const result = await repository.revert("user-1", "ex-1");

      expect(result).toEqual({ outcome: "in-use" });
    });
  });
});
