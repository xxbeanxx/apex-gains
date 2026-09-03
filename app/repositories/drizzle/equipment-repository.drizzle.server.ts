import { asc, eq, inArray, isNull, or, type SQL } from "drizzle-orm";

import { dbScope } from "~/db/index.server";
import { equipment, type Equipment as EquipmentRow } from "~/db/schema";
import { Equipment } from "~/domain/equipment/equipment";

import type { EquipmentRepository } from "../equipment-repository";

export function sampleOrOwnEquipmentWhere(
  userId: string,
  showSampleData: boolean,
): SQL {
  const ownCondition = eq(equipment.userId, userId);
  if (!showSampleData) return ownCondition;
  // Equipment has no fork-on-write rule (names are globally unique), so
  // unlike the other libraries there are no forked samples to exclude.
  return or(ownCondition, isNull(equipment.userId))!;
}

function toEquipment(row: EquipmentRow): Equipment {
  return Equipment.fromSnapshot({
    id: row.id,
    userId: row.userId,
    name: row.name,
    createdAt: row.createdAt,
  });
}

export class DrizzleEquipmentRepository implements EquipmentRepository {
  async listFor(
    userId: string,
    showSampleData: boolean,
  ): Promise<Equipment[]> {
    const rows = await dbScope
      .select()
      .from(equipment)
      .where(sampleOrOwnEquipmentWhere(userId, showSampleData))
      .orderBy(asc(equipment.name));
    return rows.map(toEquipment);
  }

  async findById(equipmentId: string): Promise<Equipment | null> {
    const row = await dbScope.query.equipment.findFirst({
      where: eq(equipment.id, equipmentId),
    });
    return row ? toEquipment(row) : null;
  }

  async findManyByIds(
    equipmentIds: readonly string[],
  ): Promise<Equipment[]> {
    if (equipmentIds.length === 0) return [];
    const rows = await dbScope
      .select()
      .from(equipment)
      .where(inArray(equipment.id, [...equipmentIds]));
    return rows.map(toEquipment);
  }

  async findByName(name: string): Promise<Equipment | null> {
    const row = await dbScope.query.equipment.findFirst({
      where: eq(equipment.name, name),
    });
    return row ? toEquipment(row) : null;
  }

  async save(item: Equipment): Promise<void> {
    const snapshot = item.toSnapshot();
    await dbScope
      .insert(equipment)
      .values(snapshot)
      .onConflictDoUpdate({
        target: equipment.id,
        set: { name: snapshot.name },
      });
  }

  /**
   * Unscoped by design: whether this athlete may remove this item is
   * `Equipment.isRemovableBy`, checked by the service inside the same unit
   * of work. The rule is stated in the domain rather than smuggled into a
   * where clause.
   */
  async delete(equipmentId: string): Promise<void> {
    await dbScope.delete(equipment).where(eq(equipment.id, equipmentId));
  }
}
