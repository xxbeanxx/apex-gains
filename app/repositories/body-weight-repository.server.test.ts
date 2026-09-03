import { afterEach, describe, expect, it, vi } from "vitest";

describe("getBodyWeightRepository", () => {
  const originalDatabaseUrl = process.env.DATABASE_URL;

  afterEach(() => {
    process.env.DATABASE_URL = originalDatabaseUrl;
    vi.resetModules();
  });

  it("resolves to the Drizzle adapter when DATABASE_URL is set", async () => {
    process.env.DATABASE_URL = "postgres://test:test@localhost:5432/test";
    const { getBodyWeightRepository } = await import("./body-weight-repository.server");
    const { DrizzleBodyWeightRepository } = await import("./drizzle/body-weight-repository.server");

    const resolved = await getBodyWeightRepository();

    expect(resolved).toBeInstanceOf(DrizzleBodyWeightRepository);
  });

  it("resolves to the in-memory adapter when DATABASE_URL is unset", async () => {
    delete process.env.DATABASE_URL;
    const { getBodyWeightRepository } = await import("./body-weight-repository.server");
    const { InMemoryBodyWeightRepository } = await import("./in-memory/body-weight-repository.server");

    const resolved = await getBodyWeightRepository();

    expect(resolved).toBeInstanceOf(InMemoryBodyWeightRepository);
  });

  it("caches the resolution across calls", async () => {
    delete process.env.DATABASE_URL;
    const { getBodyWeightRepository } = await import("./body-weight-repository.server");

    const first = await getBodyWeightRepository();
    const second = await getBodyWeightRepository();

    expect(first).toBe(second);
  });
});
