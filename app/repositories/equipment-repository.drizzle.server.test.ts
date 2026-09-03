import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Equipment } from "~/db/schema";
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

const { DrizzleEquipmentRepository } = await import(
  "./equipment-repository.drizzle.server"
);

describe("DrizzleEquipmentRepository", () => {
  beforeEach(() => {
    selectMock.mockReset();
    insertMock.mockReset();
    deleteMock.mockReset();
  });

  it("listForUser returns the query result", async () => {
    const rows = [mock<Equipment>({ id: "equip-1" })];
    selectMock.mockReturnValueOnce(dbChain(rows));
    const repository = new DrizzleEquipmentRepository();

    expect(await repository.listForUser("user-1", true)).toBe(rows);
  });

  it("findById returns null when no row matches", async () => {
    selectMock.mockReturnValueOnce(dbChain([]));
    const repository = new DrizzleEquipmentRepository();

    expect(await repository.findById("missing")).toBeNull();
  });

  it("findById returns the matching row", async () => {
    const row = mock<Equipment>({ id: "equip-1" });
    selectMock.mockReturnValueOnce(dbChain([row]));
    const repository = new DrizzleEquipmentRepository();

    expect(await repository.findById("equip-1")).toBe(row);
  });

  it("add inserts, ignoring a name conflict", async () => {
    insertMock.mockReturnValueOnce(dbChain(undefined));
    const repository = new DrizzleEquipmentRepository();

    await repository.add("user-1", "Free Weights");

    expect(insertMock).toHaveBeenCalledTimes(1);
  });

  it("remove deletes scoped to the owning user", async () => {
    deleteMock.mockReturnValueOnce(dbChain(undefined));
    const repository = new DrizzleEquipmentRepository();

    await repository.remove("user-1", "equip-1");

    expect(deleteMock).toHaveBeenCalledTimes(1);
  });
});
