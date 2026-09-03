import { afterEach, describe, expect, it, vi } from "vitest";

describe("getEquipmentRepository", () => {
  const originalDatabaseUrl = process.env.DATABASE_URL;

  afterEach(() => {
    process.env.DATABASE_URL = originalDatabaseUrl;
    vi.resetModules();
  });

  it("resolves to the Drizzle adapter when DATABASE_URL is set", async () => {
    process.env.DATABASE_URL = "postgres://test:test@localhost:5432/test";
    const { getEquipmentRepository } = await import(
      "./equipment-repository.server"
    );
    const { DrizzleEquipmentRepository } = await import(
      "./drizzle/equipment-repository.server"
    );

    const repository = await getEquipmentRepository();

    expect(repository).toBeInstanceOf(DrizzleEquipmentRepository);
  });

  it("resolves to the in-memory adapter when DATABASE_URL is unset", async () => {
    delete process.env.DATABASE_URL;
    const { getEquipmentRepository } = await import(
      "./equipment-repository.server"
    );
    const { InMemoryEquipmentRepository } = await import(
      "./in-memory/equipment-repository.server"
    );

    const repository = await getEquipmentRepository();

    expect(repository).toBeInstanceOf(InMemoryEquipmentRepository);
  });

  it("caches the resolved repository across calls", async () => {
    delete process.env.DATABASE_URL;
    const { getEquipmentRepository } = await import(
      "./equipment-repository.server"
    );

    const first = await getEquipmentRepository();
    const second = await getEquipmentRepository();

    expect(first).toBe(second);
  });
});
