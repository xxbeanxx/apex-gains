import type { Equipment } from "~/domain/equipment/equipment";

// Port: consumers depend on this interface, not on Drizzle/Postgres
// directly. See equipment-repository.server.ts for which adapter backs it at
// runtime.
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
