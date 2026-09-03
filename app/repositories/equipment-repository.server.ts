import type { Equipment } from "~/domain/equipment/equipment";

// Port: consumers depend on this interface, not on Drizzle/Postgres
// directly. The factory below picks which adapter backs it at runtime.
export interface EquipmentRepository {
  listFor(userId: string, showSampleData: boolean): Promise<Equipment[]>;
  findById(equipmentId: string): Promise<Equipment | null>;
  /**
   * Exactly these items, ignoring visibility - an exercise can link sample
   * equipment the athlete has chosen not to list, and its name is still
   * needed to render and search that exercise.
   */
  findManyByIds(equipmentIds: readonly string[]): Promise<Equipment[]>;
  /** Equipment names are globally unique, not per user - hence no userId here. */
  findByName(name: string): Promise<Equipment | null>;
  save(equipment: Equipment): Promise<void>;
  delete(equipmentId: string): Promise<void>;
}

let repository: EquipmentRepository | undefined;

// Ports and adapters: pick the adapter once per process and cache it, so
// the in-memory adapter's state actually persists across requests. See
// athletes-repository.server.ts for why the adapter modules are imported
// dynamically rather than at the top of this file.
export async function getEquipmentRepository(): Promise<EquipmentRepository> {
  if (!repository) {
    repository = process.env.DATABASE_URL
      ? new (
          await import("./drizzle/equipment-repository.drizzle.server")
        ).DrizzleEquipmentRepository()
      : new (
          await import("./in-memory/equipment-repository.in-memory.server")
        ).InMemoryEquipmentRepository();
  }
  return repository;
}
