import { afterEach, describe, expect, it, vi } from "vitest";

describe("getUsersRepository", () => {
  const originalDatabaseUrl = process.env.DATABASE_URL;

  afterEach(() => {
    process.env.DATABASE_URL = originalDatabaseUrl;
    vi.resetModules();
  });

  it("resolves to the Drizzle adapter when DATABASE_URL is set", async () => {
    process.env.DATABASE_URL = "postgres://test:test@localhost:5432/test";
    const { getUsersRepository } = await import("./users-repository.server");
    const { DrizzleUsersRepository } = await import(
      "./users-repository.drizzle.server"
    );

    const repository = await getUsersRepository();

    expect(repository).toBeInstanceOf(DrizzleUsersRepository);
  });

  it("resolves to the in-memory adapter when DATABASE_URL is unset", async () => {
    delete process.env.DATABASE_URL;
    const { getUsersRepository } = await import("./users-repository.server");
    const { InMemoryUsersRepository } = await import(
      "./users-repository.in-memory.server"
    );

    const repository = await getUsersRepository();

    expect(repository).toBeInstanceOf(InMemoryUsersRepository);
  });

  it("caches the resolved repository across calls", async () => {
    delete process.env.DATABASE_URL;
    const { getUsersRepository } = await import("./users-repository.server");

    const first = await getUsersRepository();
    const second = await getUsersRepository();

    expect(first).toBe(second);
  });
});
