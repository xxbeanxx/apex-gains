import { afterEach, describe, expect, it, vi } from "vitest";

describe("getAthletesRepository", () => {
  const originalDatabaseUrl = process.env.DATABASE_URL;

  afterEach(() => {
    process.env.DATABASE_URL = originalDatabaseUrl;
    vi.resetModules();
  });

  it("resolves to the Drizzle adapter when DATABASE_URL is set", async () => {
    process.env.DATABASE_URL = "postgres://test:test@localhost:5432/test";
    const { getAthletesRepository } = await import("./athletes-repository.server");
    const { DrizzleAthletesRepository } = await import("./athletes-repository.drizzle.server");

    const resolved = await getAthletesRepository();

    expect(resolved).toBeInstanceOf(DrizzleAthletesRepository);
  });

  it("resolves to the in-memory adapter when DATABASE_URL is unset", async () => {
    delete process.env.DATABASE_URL;
    const { getAthletesRepository } = await import("./athletes-repository.server");
    const { InMemoryAthletesRepository } = await import("./athletes-repository.in-memory.server");

    const resolved = await getAthletesRepository();

    expect(resolved).toBeInstanceOf(InMemoryAthletesRepository);
  });

  it("caches the resolution across calls", async () => {
    delete process.env.DATABASE_URL;
    const { getAthletesRepository } = await import("./athletes-repository.server");

    const first = await getAthletesRepository();
    const second = await getAthletesRepository();

    expect(first).toBe(second);
  });
});
