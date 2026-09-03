import { afterEach, describe, expect, it, vi } from "vitest";

describe("getRoutinesRepository", () => {
  const originalDatabaseUrl = process.env.DATABASE_URL;

  afterEach(() => {
    process.env.DATABASE_URL = originalDatabaseUrl;
    vi.resetModules();
  });

  it("resolves to the Drizzle adapter when DATABASE_URL is set", async () => {
    process.env.DATABASE_URL = "postgres://test:test@localhost:5432/test";
    const { getRoutinesRepository } = await import(
      "./routines-repository.server"
    );
    const { DrizzleRoutinesRepository } = await import(
      "./routines-repository.drizzle.server"
    );

    const repository = await getRoutinesRepository();

    expect(repository).toBeInstanceOf(DrizzleRoutinesRepository);
  });

  it("resolves to the in-memory adapter when DATABASE_URL is unset", async () => {
    delete process.env.DATABASE_URL;
    const { getRoutinesRepository } = await import(
      "./routines-repository.server"
    );
    const { InMemoryRoutinesRepository } = await import(
      "./routines-repository.in-memory.server"
    );

    const repository = await getRoutinesRepository();

    expect(repository).toBeInstanceOf(InMemoryRoutinesRepository);
  });

  it("caches the resolved repository across calls", async () => {
    delete process.env.DATABASE_URL;
    const { getRoutinesRepository } = await import(
      "./routines-repository.server"
    );

    const first = await getRoutinesRepository();
    const second = await getRoutinesRepository();

    expect(first).toBe(second);
  });
});
