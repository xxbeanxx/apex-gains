import { randomUUID } from "node:crypto";

import type { Equipment } from "~/db/schema";

import type { EquipmentRepository } from "./equipment-repository";

// Dev-convenience adapter for running the app without a database
// configured (see equipment-repository.server.ts for the selection rule).
// Data lives only for the life of the process.
export class InMemoryEquipmentRepository implements EquipmentRepository {
  private readonly equipmentById = new Map<string, Equipment>();

  async listForUser(userId: string, showSampleData: boolean) {
    const rows = [...this.equipmentById.values()].filter(
      (row) => row.userId === userId || (showSampleData && row.userId === null),
    );
    return rows.sort((a, b) => a.name.localeCompare(b.name));
  }

  async findById(equipmentId: string) {
    return this.equipmentById.get(equipmentId) ?? null;
  }

  async add(userId: string, name: string) {
    const nameTaken = [...this.equipmentById.values()].some(
      (row) => row.name === name,
    );
    if (nameTaken) return;

    const equipment: Equipment = {
      id: randomUUID(),
      userId,
      name,
      createdAt: new Date(),
    };
    this.equipmentById.set(equipment.id, equipment);
  }

  async remove(userId: string, equipmentId: string) {
    const row = this.equipmentById.get(equipmentId);
    if (row?.userId === userId) {
      this.equipmentById.delete(equipmentId);
    }
  }
}
