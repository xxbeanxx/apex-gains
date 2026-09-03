import { afterEach, describe, expect, it, vi } from "vitest";

describe("getBodyWeightLogsRepository", () => {
  const originalDatabaseUrl = process.env.DATABASE_URL;

  afterEach(() => {
    process.env.DATABASE_URL = originalDatabaseUrl;
    vi.resetModules();
  });

  it("resolves to the Drizzle adapter when DATABASE_URL is set", async () => {
    process.env.DATABASE_URL = "postgres://test:test@localhost:5432/test";
    const { getBodyWeightLogsRepository } = await import(
      "./body-weight-logs-repository.server"
    );
    const { DrizzleBodyWeightLogsRepository } = await import(
      "./body-weight-logs-repository.drizzle.server"
    );

    const repository = await getBodyWeightLogsRepository();

    expect(repository).toBeInstanceOf(DrizzleBodyWeightLogsRepository);
  });

  it("resolves to the in-memory adapter when DATABASE_URL is unset", async () => {
    delete process.env.DATABASE_URL;
    const { getBodyWeightLogsRepository } = await import(
      "./body-weight-logs-repository.server"
    );
    const { InMemoryBodyWeightLogsRepository } = await import(
      "./body-weight-logs-repository.in-memory.server"
    );

    const repository = await getBodyWeightLogsRepository();

    expect(repository).toBeInstanceOf(InMemoryBodyWeightLogsRepository);
  });

  it("caches the resolved repository across calls", async () => {
    delete process.env.DATABASE_URL;
    const { getBodyWeightLogsRepository } = await import(
      "./body-weight-logs-repository.server"
    );

    const first = await getBodyWeightLogsRepository();
    const second = await getBodyWeightLogsRepository();

    expect(first).toBe(second);
  });
});
