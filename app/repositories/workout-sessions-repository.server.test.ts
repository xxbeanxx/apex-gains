import { afterEach, describe, expect, it, vi } from "vitest";

describe("getWorkoutSessionsRepository", () => {
  const originalDatabaseUrl = process.env.DATABASE_URL;

  afterEach(() => {
    process.env.DATABASE_URL = originalDatabaseUrl;
    vi.resetModules();
  });

  it("resolves to the Drizzle adapter when DATABASE_URL is set", async () => {
    process.env.DATABASE_URL = "postgres://test:test@localhost:5432/test";
    const { getWorkoutSessionsRepository } = await import(
      "./workout-sessions-repository.server"
    );
    const { DrizzleWorkoutSessionsRepository } = await import(
      "./drizzle/workout-sessions-repository.server"
    );

    const repository = await getWorkoutSessionsRepository();

    expect(repository).toBeInstanceOf(DrizzleWorkoutSessionsRepository);
  });

  it("resolves to the in-memory adapter when DATABASE_URL is unset", async () => {
    delete process.env.DATABASE_URL;
    const { getWorkoutSessionsRepository } = await import(
      "./workout-sessions-repository.server"
    );
    const { InMemoryWorkoutSessionsRepository } = await import(
      "./in-memory/workout-sessions-repository.server"
    );

    const repository = await getWorkoutSessionsRepository();

    expect(repository).toBeInstanceOf(InMemoryWorkoutSessionsRepository);
  });

  it("caches the resolved repository across calls", async () => {
    delete process.env.DATABASE_URL;
    const { getWorkoutSessionsRepository } = await import(
      "./workout-sessions-repository.server"
    );

    const first = await getWorkoutSessionsRepository();
    const second = await getWorkoutSessionsRepository();

    expect(first).toBe(second);
  });
});
