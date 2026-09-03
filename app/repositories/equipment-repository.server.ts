import type { EquipmentRepository } from "./equipment-repository";

let repository: EquipmentRepository | undefined;

// Ports and adapters: pick the adapter once per process and cache it, so
// the in-memory adapter's state actually persists across requests. See
// users-repository.server.ts for why the adapter modules are imported
// dynamically rather than at the top of this file.
export async function getEquipmentRepository(): Promise<EquipmentRepository> {
  if (!repository) {
    repository = process.env.DATABASE_URL
      ? new (
          await import("./equipment-repository.drizzle.server")
        ).DrizzleEquipmentRepository()
      : new (
          await import("./equipment-repository.in-memory.server")
        ).InMemoryEquipmentRepository();
  }
  return repository;
}
