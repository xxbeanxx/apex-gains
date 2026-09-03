import { afterEach, describe, expect, it, vi } from "vitest";

describe("getUnitOfWork", () => {
  const originalDatabaseUrl = process.env.DATABASE_URL;

  afterEach(() => {
    process.env.DATABASE_URL = originalDatabaseUrl;
    vi.resetModules();
  });

  it("resolves to the Drizzle adapter when DATABASE_URL is set", async () => {
    process.env.DATABASE_URL = "postgres://test:test@localhost:5432/test";
    const { getUnitOfWork } = await import("./unit-of-work.server");
    const { DrizzleUnitOfWork } = await import("./unit-of-work.drizzle.server");

    const resolved = await getUnitOfWork();

    expect(resolved).toBeInstanceOf(DrizzleUnitOfWork);
  });

  it("resolves to the in-memory adapter when DATABASE_URL is unset", async () => {
    delete process.env.DATABASE_URL;
    const { getUnitOfWork } = await import("./unit-of-work.server");
    const { InMemoryUnitOfWork } = await import("./unit-of-work.in-memory.server");

    const resolved = await getUnitOfWork();

    expect(resolved).toBeInstanceOf(InMemoryUnitOfWork);
  });

  it("caches the resolution across calls", async () => {
    delete process.env.DATABASE_URL;
    const { getUnitOfWork } = await import("./unit-of-work.server");

    const first = await getUnitOfWork();
    const second = await getUnitOfWork();

    expect(first).toBe(second);
  });
});
