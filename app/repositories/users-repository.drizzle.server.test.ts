import { beforeEach, describe, expect, it, vi } from "vitest";

import type { User } from "~/db/schema";
import { dbChain } from "~/test/db-chain";
import { mock } from "~/test/mock";

const { selectMock, insertMock, updateMock } = vi.hoisted(() => ({
  selectMock: vi.fn(),
  insertMock: vi.fn(),
  updateMock: vi.fn(),
}));

vi.mock("~/db/index.server", () => ({
  db: mock<typeof import("~/db/index.server").db>({
    select: selectMock,
    insert: insertMock,
    update: updateMock,
  }),
}));

const { DrizzleUsersRepository } = await import(
  "./users-repository.drizzle.server"
);

describe("DrizzleUsersRepository", () => {
  beforeEach(() => {
    selectMock.mockReset();
    insertMock.mockReset();
    updateMock.mockReset();
  });

  it("findById returns null when no row matches", async () => {
    selectMock.mockReturnValueOnce(dbChain([]));
    const repository = new DrizzleUsersRepository();

    expect(await repository.findById("missing")).toBeNull();
  });

  it("findById returns the matching row", async () => {
    const user = mock<User>({ id: "user-1" });
    selectMock.mockReturnValueOnce(dbChain([user]));
    const repository = new DrizzleUsersRepository();

    expect(await repository.findById("user-1")).toBe(user);
  });

  it("findByGoogleSub returns the matching row", async () => {
    const user = mock<User>({ id: "user-1", googleSub: "google-1" });
    selectMock.mockReturnValueOnce(dbChain([user]));
    const repository = new DrizzleUsersRepository();

    expect(await repository.findByGoogleSub("google-1")).toBe(user);
  });

  it("findByEmail returns the matching row", async () => {
    const user = mock<User>({ id: "user-1", email: "greg@example.com" });
    selectMock.mockReturnValueOnce(dbChain([user]));
    const repository = new DrizzleUsersRepository();

    expect(await repository.findByEmail("greg@example.com")).toBe(user);
  });

  it("create inserts and returns the new row", async () => {
    const user = mock<User>({ id: "user-1" });
    insertMock.mockReturnValueOnce(dbChain([user]));
    const repository = new DrizzleUsersRepository();

    const result = await repository.create({
      googleSub: "google-1",
      email: "greg@example.com",
      name: "Greg",
    });

    expect(result).toBe(user);
  });

  it("updatePreferences updates the user's units", async () => {
    updateMock.mockReturnValue(dbChain(undefined));
    const repository = new DrizzleUsersRepository();

    await repository.updatePreferences("user-1", {
      weightUnit: "kg",
      distanceUnit: "mi",
    });

    expect(updateMock).toHaveBeenCalledTimes(1);
  });

  it("updateShowSampleData updates the flag", async () => {
    updateMock.mockReturnValue(dbChain(undefined));
    const repository = new DrizzleUsersRepository();

    await repository.updateShowSampleData("user-1", false);

    expect(updateMock).toHaveBeenCalledTimes(1);
  });
});
