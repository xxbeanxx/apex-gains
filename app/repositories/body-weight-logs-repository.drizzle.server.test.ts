import { beforeEach, describe, expect, it, vi } from "vitest";

import type { BodyWeightLog } from "~/db/schema";
import { dbChain } from "~/test/db-chain";
import { mock } from "~/test/mock";

const { selectMock, insertMock, deleteMock } = vi.hoisted(() => ({
  selectMock: vi.fn(),
  insertMock: vi.fn(),
  deleteMock: vi.fn(),
}));

vi.mock("~/db/index.server", () => ({
  db: mock<typeof import("~/db/index.server").db>({
    select: selectMock,
    insert: insertMock,
    delete: deleteMock,
  }),
}));

const { DrizzleBodyWeightLogsRepository } = await import(
  "./body-weight-logs-repository.drizzle.server"
);

describe("DrizzleBodyWeightLogsRepository", () => {
  beforeEach(() => {
    selectMock.mockReset();
    insertMock.mockReset();
    deleteMock.mockReset();
  });

  it("logForDate returns the upserted row", async () => {
    const log = mock<BodyWeightLog>({ id: "log-1", weight: "180.5" });
    insertMock.mockReturnValueOnce(dbChain([log]));
    const repository = new DrizzleBodyWeightLogsRepository();

    expect(await repository.logForDate("user-1", "2026-09-01", 180.5)).toBe(
      log,
    );
  });

  it("listRecentForUser returns the query result", async () => {
    const rows = [mock<BodyWeightLog>({ id: "log-1" })];
    selectMock.mockReturnValueOnce(dbChain(rows));
    const repository = new DrizzleBodyWeightLogsRepository();

    expect(await repository.listRecentForUser("user-1", 10)).toBe(rows);
  });

  it("removeOwnedByUser returns removed when a row was deleted", async () => {
    deleteMock.mockReturnValueOnce(dbChain([{ id: "log-1" }]));
    const repository = new DrizzleBodyWeightLogsRepository();

    expect(await repository.removeOwnedByUser("user-1", "log-1")).toBe(
      "removed",
    );
  });

  it("removeOwnedByUser returns not-found when nothing matched", async () => {
    deleteMock.mockReturnValueOnce(dbChain([]));
    const repository = new DrizzleBodyWeightLogsRepository();

    expect(await repository.removeOwnedByUser("user-1", "missing")).toBe(
      "not-found",
    );
  });
});
