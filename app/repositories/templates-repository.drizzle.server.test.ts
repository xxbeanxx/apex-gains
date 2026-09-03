import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Transaction } from "~/db/index.server";
import type { Exercise, Template, TemplateExercise } from "~/db/schema";
import { dbChain } from "~/test/db-chain";
import { mock } from "~/test/mock";

const {
  selectMock,
  templatesFindFirstMock,
  templatesFindManyMock,
  exercisesFindFirstMock,
  insertMock,
  updateMock,
  deleteMock,
  transactionMock,
} = vi.hoisted(() => ({
  selectMock: vi.fn(),
  templatesFindFirstMock: vi.fn(),
  templatesFindManyMock: vi.fn(),
  exercisesFindFirstMock: vi.fn(),
  insertMock: vi.fn(),
  updateMock: vi.fn(),
  deleteMock: vi.fn(),
  transactionMock: vi.fn(),
}));

vi.mock("~/db/index.server", () => ({
  db: mock<typeof import("~/db/index.server").db>({
    // sampleOrOwnTemplatesWhere builds a "not yet forked" subquery via
    // db.select(...) even though nothing here ever awaits it directly.
    select: selectMock,
    query: mock<typeof import("~/db/index.server").db.query>({
      templates: mock({
        findFirst: templatesFindFirstMock,
        findMany: templatesFindManyMock,
      }),
      exercises: mock({ findFirst: exercisesFindFirstMock }),
    }),
    insert: insertMock,
    update: updateMock,
    delete: deleteMock,
    transaction: transactionMock,
  }),
}));

const { DrizzleTemplatesRepository } = await import(
  "./templates-repository.drizzle.server"
);

type Tx = Transaction;
type LoadedTemplate = Template & { templateExercises: TemplateExercise[] };

function tx(opts: {
  templatesFindFirst: (LoadedTemplate | undefined)[];
  exercise?: Exercise;
  insert?: ReturnType<typeof vi.fn>;
  update?: ReturnType<typeof vi.fn>;
  delete?: ReturnType<typeof vi.fn>;
}): Tx {
  const findFirst = vi.fn();
  for (const value of opts.templatesFindFirst) {
    findFirst.mockResolvedValueOnce(value);
  }
  return mock<Tx>({
    query: mock<Tx["query"]>({
      templates: mock<Tx["query"]["templates"]>({ findFirst }),
      exercises: mock<Tx["query"]["exercises"]>({
        findFirst: vi.fn().mockResolvedValue(opts.exercise),
      }),
    }),
    insert: opts.insert ?? vi.fn().mockReturnValue(dbChain([])),
    update: opts.update ?? vi.fn(() => dbChain(undefined)),
    delete: opts.delete ?? vi.fn(() => dbChain(undefined)),
  });
}

function runInTx(t: Tx) {
  transactionMock.mockImplementation((cb: (tx: Tx) => unknown) => cb(t));
  return new DrizzleTemplatesRepository();
}

describe("DrizzleTemplatesRepository", () => {
  beforeEach(() => {
    selectMock.mockReset().mockReturnValue(dbChain([]));
    templatesFindFirstMock.mockReset();
    templatesFindManyMock.mockReset();
    exercisesFindFirstMock.mockReset();
    insertMock.mockReset();
    updateMock.mockReset();
    deleteMock.mockReset();
    transactionMock.mockReset();
  });

  it("listForUser passes through the relational query result", async () => {
    const rows = [mock<Template>({ id: "t-1" })];
    templatesFindManyMock.mockResolvedValue(rows);
    const repository = new DrizzleTemplatesRepository();

    expect(await repository.listForUser("user-1", true)).toBe(rows);
  });

  it("findVisibleForUser passes through the relational query result", async () => {
    const template = mock<Template>({ id: "t-1" });
    templatesFindFirstMock.mockResolvedValue(template);
    const repository = new DrizzleTemplatesRepository();

    expect(await repository.findVisibleForUser("user-1", "t-1")).toBe(
      template,
    );
  });

  it("findVisibleForUser returns null when nothing matches", async () => {
    templatesFindFirstMock.mockResolvedValue(undefined);
    const repository = new DrizzleTemplatesRepository();

    expect(await repository.findVisibleForUser("user-1", "missing")).toBeNull();
  });

  it("create inserts and returns the new row", async () => {
    const template = mock<Template>({ id: "t-1" });
    insertMock.mockReturnValueOnce(dbChain([template]));
    const repository = new DrizzleTemplatesRepository();

    expect(await repository.create("user-1", "Push Day")).toBe(template);
  });

  describe("delete", () => {
    it("returns not-found for a missing/invisible template", async () => {
      templatesFindFirstMock.mockResolvedValue(undefined);
      const repository = new DrizzleTemplatesRepository();

      expect(await repository.delete("user-1", "missing")).toEqual({
        outcome: "not-found",
      });
    });

    it("refuses to delete a sample template", async () => {
      templatesFindFirstMock.mockResolvedValue(
        mock<Template>({ id: "t-1", userId: null }),
      );
      const repository = new DrizzleTemplatesRepository();

      expect(await repository.delete("user-1", "t-1")).toEqual({
        outcome: "sample-template",
      });
      expect(deleteMock).not.toHaveBeenCalled();
    });

    it("deletes an owned template", async () => {
      templatesFindFirstMock.mockResolvedValue(
        mock<Template>({ id: "t-1", userId: "user-1" }),
      );
      deleteMock.mockReturnValue(dbChain(undefined));
      const repository = new DrizzleTemplatesRepository();

      expect(await repository.delete("user-1", "t-1")).toEqual({
        outcome: "deleted",
      });
    });
  });

  describe("revert", () => {
    it("returns not-found for a missing/invisible template", async () => {
      templatesFindFirstMock.mockResolvedValue(undefined);
      const repository = new DrizzleTemplatesRepository();

      expect(await repository.revert("user-1", "missing")).toEqual({
        outcome: "not-found",
      });
    });

    it("returns nothing-to-revert for a template that isn't a fork", async () => {
      templatesFindFirstMock.mockResolvedValue(
        mock<Template>({ id: "t-1", userId: "user-1", forkedFromId: null }),
      );
      const repository = new DrizzleTemplatesRepository();

      expect(await repository.revert("user-1", "t-1")).toEqual({
        outcome: "nothing-to-revert",
      });
    });

    it("deletes the fork and reports its sample origin", async () => {
      templatesFindFirstMock.mockResolvedValue(
        mock<Template>({
          id: "t-1",
          userId: "user-1",
          forkedFromId: "sample-1",
        }),
      );
      deleteMock.mockReturnValue(dbChain(undefined));
      const repository = new DrizzleTemplatesRepository();

      expect(await repository.revert("user-1", "t-1")).toEqual({
        outcome: "reverted",
        forkedFromId: "sample-1",
      });
    });
  });

  describe("rename", () => {
    it("returns not-found for a missing/invisible template", async () => {
      const repository = runInTx(tx({ templatesFindFirst: [undefined] }));

      expect(await repository.rename("user-1", "missing", "New Name")).toEqual(
        { outcome: "not-found" },
      );
    });

    it("renames an owned template directly", async () => {
      const template = mock<LoadedTemplate>({
        id: "t-1",
        userId: "user-1",
        templateExercises: [],
      });
      const update = vi.fn(() => dbChain(undefined));
      const repository = runInTx(
        tx({ templatesFindFirst: [template], update }),
      );

      const result = await repository.rename("user-1", "t-1", "New Name");

      expect(result).toEqual({ outcome: "renamed", forkedTemplateId: null });
      expect(update).toHaveBeenCalledTimes(1);
    });

    it("forks a sample template before renaming it", async () => {
      const sample = mock<LoadedTemplate>({
        id: "sample-1",
        userId: null,
        templateExercises: [],
      });
      const fork = mock<Template>({ id: "fork-1", userId: "user-1" });
      const insert = vi.fn().mockReturnValueOnce(dbChain([fork]));
      const update = vi.fn(() => dbChain(undefined));
      const repository = runInTx(
        tx({
          // 1: the template itself (sample); 2: no existing fork yet.
          templatesFindFirst: [sample, undefined],
          insert,
          update,
        }),
      );

      const result = await repository.rename("user-1", "sample-1", "New Name");

      expect(result).toEqual({
        outcome: "renamed",
        forkedTemplateId: "fork-1",
      });
      expect(insert).toHaveBeenCalledTimes(1);
    });
  });

  describe("addExercise", () => {
    it("returns not-found for a missing/invisible template", async () => {
      const repository = runInTx(tx({ templatesFindFirst: [undefined] }));

      const result = await repository.addExercise("user-1", "missing", {
        exerciseId: "ex-1",
      });

      expect(result).toEqual({ outcome: "not-found" });
    });

    it("returns exercise-not-found when the exercise doesn't exist", async () => {
      const template = mock<LoadedTemplate>({
        id: "t-1",
        userId: "user-1",
        templateExercises: [],
      });
      const repository = runInTx(
        tx({ templatesFindFirst: [template], exercise: undefined }),
      );

      const result = await repository.addExercise("user-1", "t-1", {
        exerciseId: "missing",
      });

      expect(result).toEqual({ outcome: "exercise-not-found" });
    });

    it("adds the exercise at the next position on an owned template", async () => {
      const template = mock<LoadedTemplate>({
        id: "t-1",
        userId: "user-1",
        templateExercises: [
          mock<TemplateExercise>({ id: "te-1", position: 0 }),
        ],
      });
      const exercise = mock<Exercise>({ id: "ex-1" });
      const insert = vi.fn().mockReturnValue(dbChain(undefined));
      const repository = runInTx(
        tx({ templatesFindFirst: [template], exercise, insert }),
      );

      const result = await repository.addExercise("user-1", "t-1", {
        exerciseId: "ex-1",
        targetSets: 3,
      });

      expect(result).toEqual({ outcome: "added", forkedTemplateId: null });
      expect(insert).toHaveBeenCalledTimes(1);
    });

    it("forks a sample template before adding an exercise to it", async () => {
      const sample = mock<LoadedTemplate>({
        id: "sample-1",
        userId: null,
        templateExercises: [],
      });
      const fork = mock<Template>({ id: "fork-1", userId: "user-1" });
      const exercise = mock<Exercise>({ id: "ex-1" });
      const insert = vi
        .fn()
        .mockReturnValueOnce(dbChain([fork])) // the fork itself
        .mockReturnValueOnce(dbChain(undefined)); // the new template exercise
      const repository = runInTx(
        tx({
          templatesFindFirst: [sample, undefined],
          exercise,
          insert,
        }),
      );

      const result = await repository.addExercise("user-1", "sample-1", {
        exerciseId: "ex-1",
      });

      expect(result).toEqual({ outcome: "added", forkedTemplateId: "fork-1" });
      expect(insert).toHaveBeenCalledTimes(2);
    });
  });

  describe("removeExercise", () => {
    it("returns not-found for a missing/invisible template", async () => {
      const repository = runInTx(tx({ templatesFindFirst: [undefined] }));

      const result = await repository.removeExercise(
        "user-1",
        "missing",
        "te-1",
      );

      expect(result).toEqual({ outcome: "not-found" });
    });

    it("removes the exercise from an owned template", async () => {
      const template = mock<LoadedTemplate>({
        id: "t-1",
        userId: "user-1",
        templateExercises: [
          mock<TemplateExercise>({ id: "te-1", position: 0 }),
        ],
      });
      const deleteFn = vi.fn(() => dbChain(undefined));
      const repository = runInTx(
        tx({ templatesFindFirst: [template], delete: deleteFn }),
      );

      const result = await repository.removeExercise("user-1", "t-1", "te-1");

      expect(result).toEqual({ outcome: "removed", forkedTemplateId: null });
      expect(deleteFn).toHaveBeenCalledTimes(1);
    });

    it("forks a sample template, remapping the id, before removing", async () => {
      const sample = mock<LoadedTemplate>({
        id: "sample-1",
        userId: null,
        templateExercises: [
          mock<TemplateExercise>({ id: "te-1", position: 0 }),
        ],
      });
      const fork = mock<Template>({ id: "fork-1", userId: "user-1" });
      const forkedTe = mock<TemplateExercise>({
        id: "forked-te-1",
        position: 0,
      });
      const insert = vi
        .fn()
        .mockReturnValueOnce(dbChain([fork]))
        .mockReturnValueOnce(dbChain([forkedTe]));
      const deleteFn = vi.fn(() => dbChain(undefined));
      const repository = runInTx(
        tx({
          templatesFindFirst: [sample, undefined],
          insert,
          delete: deleteFn,
        }),
      );

      const result = await repository.removeExercise(
        "user-1",
        "sample-1",
        "te-1",
      );

      expect(result).toEqual({
        outcome: "removed",
        forkedTemplateId: "fork-1",
      });
      expect(deleteFn).toHaveBeenCalledTimes(1);
    });
  });

  describe("moveExercise", () => {
    it("returns no-op when moving the first item up", async () => {
      const template = mock<LoadedTemplate>({
        id: "t-1",
        userId: "user-1",
        templateExercises: [
          mock<TemplateExercise>({ id: "te-1", position: 0 }),
          mock<TemplateExercise>({ id: "te-2", position: 1 }),
        ],
      });
      const repository = runInTx(tx({ templatesFindFirst: [template] }));

      const result = await repository.moveExercise(
        "user-1",
        "t-1",
        "te-1",
        "up",
      );

      expect(result).toEqual({ outcome: "no-op", forkedTemplateId: null });
    });

    it("swaps positions when moving down", async () => {
      const template = mock<LoadedTemplate>({
        id: "t-1",
        userId: "user-1",
        templateExercises: [
          mock<TemplateExercise>({ id: "te-1", position: 0 }),
          mock<TemplateExercise>({ id: "te-2", position: 1 }),
        ],
      });
      const update = vi.fn(() => dbChain(undefined));
      const repository = runInTx(
        tx({ templatesFindFirst: [template], update }),
      );

      const result = await repository.moveExercise(
        "user-1",
        "t-1",
        "te-1",
        "down",
      );

      expect(result).toEqual({ outcome: "moved", forkedTemplateId: null });
      expect(update).toHaveBeenCalledTimes(3);
    });

    it("forks a sample template even for a no-op move", async () => {
      const sample = mock<LoadedTemplate>({
        id: "sample-1",
        userId: null,
        templateExercises: [
          mock<TemplateExercise>({ id: "te-1", position: 0 }),
        ],
      });
      const fork = mock<Template>({ id: "fork-1", userId: "user-1" });
      const forkedTe = mock<TemplateExercise>({
        id: "forked-te-1",
        position: 0,
      });
      const insert = vi.fn().mockReturnValueOnce(dbChain([fork])).mockReturnValueOnce(
        dbChain([forkedTe]),
      );
      const repository = runInTx(
        tx({ templatesFindFirst: [sample, undefined], insert }),
      );

      const result = await repository.moveExercise(
        "user-1",
        "sample-1",
        "te-1",
        "up",
      );

      expect(result).toEqual({ outcome: "no-op", forkedTemplateId: "fork-1" });
    });
  });
});
