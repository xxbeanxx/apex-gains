import { afterEach, describe, expect, it, vi } from "vitest";

describe("getTemplatesRepository", () => {
  const originalDatabaseUrl = process.env.DATABASE_URL;

  afterEach(() => {
    process.env.DATABASE_URL = originalDatabaseUrl;
    vi.resetModules();
  });

  it("resolves to the Drizzle adapter when DATABASE_URL is set", async () => {
    process.env.DATABASE_URL = "postgres://test:test@localhost:5432/test";
    const { getTemplatesRepository } = await import(
      "./templates-repository.server"
    );
    const { DrizzleTemplatesRepository } = await import(
      "./drizzle/templates-repository.server"
    );

    const repository = await getTemplatesRepository();

    expect(repository).toBeInstanceOf(DrizzleTemplatesRepository);
  });

  it("resolves to the in-memory adapter when DATABASE_URL is unset", async () => {
    delete process.env.DATABASE_URL;
    const { getTemplatesRepository } = await import(
      "./templates-repository.server"
    );
    const { InMemoryTemplatesRepository } = await import(
      "./in-memory/templates-repository.server"
    );

    const repository = await getTemplatesRepository();

    expect(repository).toBeInstanceOf(InMemoryTemplatesRepository);
  });

  it("caches the resolved repository across calls", async () => {
    delete process.env.DATABASE_URL;
    const { getTemplatesRepository } = await import(
      "./templates-repository.server"
    );

    const first = await getTemplatesRepository();
    const second = await getTemplatesRepository();

    expect(first).toBe(second);
  });
});
