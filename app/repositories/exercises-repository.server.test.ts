import { afterEach, describe, expect, it, vi } from "vitest";

describe("getExercisesRepository", () => {
  const originalDatabaseUrl = process.env.DATABASE_URL;

  afterEach(() => {
    process.env.DATABASE_URL = originalDatabaseUrl;
    vi.resetModules();
  });

  it("resolves to the Drizzle adapter when DATABASE_URL is set", async () => {
    process.env.DATABASE_URL = "postgres://test:test@localhost:5432/test";
    const { getExercisesRepository } = await import(
      "./exercises-repository.server"
    );
    const { DrizzleExercisesRepository } = await import(
      "./exercises-repository.drizzle.server"
    );

    const repository = await getExercisesRepository();

    expect(repository).toBeInstanceOf(DrizzleExercisesRepository);
  });

  it("resolves to the in-memory adapter when DATABASE_URL is unset", async () => {
    delete process.env.DATABASE_URL;
    const { getExercisesRepository } = await import(
      "./exercises-repository.server"
    );
    const { InMemoryExercisesRepository } = await import(
      "./exercises-repository.in-memory.server"
    );

    const repository = await getExercisesRepository();

    expect(repository).toBeInstanceOf(InMemoryExercisesRepository);
  });

  it("caches the resolved repository across calls", async () => {
    delete process.env.DATABASE_URL;
    const { getExercisesRepository } = await import(
      "./exercises-repository.server"
    );

    const first = await getExercisesRepository();
    const second = await getExercisesRepository();

    expect(first).toBe(second);
  });
});
