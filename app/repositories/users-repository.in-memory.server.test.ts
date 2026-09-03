import { describe, expect, it } from "vitest";

import { InMemoryUsersRepository } from "./users-repository.in-memory.server";

describe("InMemoryUsersRepository", () => {
  it("returns null from every finder when no user matches", async () => {
    const repository = new InMemoryUsersRepository();

    expect(await repository.findById("missing")).toBeNull();
    expect(await repository.findByGoogleSub("missing")).toBeNull();
    expect(await repository.findByEmail("missing@example.com")).toBeNull();
  });

  it("creates a user with the schema's default fields filled in", async () => {
    const repository = new InMemoryUsersRepository();

    const user = await repository.create({
      googleSub: "google-1",
      email: "greg@example.com",
      name: "Greg",
    });

    expect(user).toMatchObject({
      googleSub: "google-1",
      email: "greg@example.com",
      name: "Greg",
      avatarUrl: null,
      weightUnit: "lb",
      distanceUnit: "km",
      showSampleData: true,
    });
    expect(user.id).toEqual(expect.any(String));
  });

  it("passes avatarUrl through when given", async () => {
    const repository = new InMemoryUsersRepository();

    const user = await repository.create({
      googleSub: "google-1",
      email: "greg@example.com",
      name: "Greg",
      avatarUrl: "https://example.com/avatar.png",
    });

    expect(user.avatarUrl).toBe("https://example.com/avatar.png");
  });

  it("finds a created user by id, googleSub, and email", async () => {
    const repository = new InMemoryUsersRepository();
    const created = await repository.create({
      googleSub: "google-1",
      email: "greg@example.com",
      name: "Greg",
    });

    expect(await repository.findById(created.id)).toBe(created);
    expect(await repository.findByGoogleSub("google-1")).toBe(created);
    expect(await repository.findByEmail("greg@example.com")).toBe(created);
  });

  describe("updatePreferences", () => {
    it("updates weight and distance units", async () => {
      const repository = new InMemoryUsersRepository();
      const created = await repository.create({
        googleSub: "google-1",
        email: "greg@example.com",
        name: "Greg",
      });

      await repository.updatePreferences(created.id, {
        weightUnit: "kg",
        distanceUnit: "mi",
      });

      const updated = await repository.findById(created.id);
      expect(updated).toMatchObject({ weightUnit: "kg", distanceUnit: "mi" });
    });

    it("does nothing for an unknown user", async () => {
      const repository = new InMemoryUsersRepository();

      await expect(
        repository.updatePreferences("missing", {
          weightUnit: "kg",
          distanceUnit: "mi",
        }),
      ).resolves.toBeUndefined();
    });
  });

  describe("updateShowSampleData", () => {
    it("updates the flag", async () => {
      const repository = new InMemoryUsersRepository();
      const created = await repository.create({
        googleSub: "google-1",
        email: "greg@example.com",
        name: "Greg",
      });

      await repository.updateShowSampleData(created.id, false);

      const updated = await repository.findById(created.id);
      expect(updated?.showSampleData).toBe(false);
    });
  });
});
