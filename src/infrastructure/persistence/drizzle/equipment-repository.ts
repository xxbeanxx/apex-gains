import { asc, eq, inArray } from 'drizzle-orm';

import type { EquipmentRepository } from '~application/ports/persistence/equipment-repository';
import { Equipment } from '~domain/equipment/equipment';
import { dbScope } from '~infrastructure/persistence/drizzle/index';
import { type Equipment as EquipmentRow, equipment } from '~infrastructure/persistence/drizzle/schema';
import { ownOrSampleWhere } from '~infrastructure/persistence/drizzle/shared/visibility';

/**
 * Equipment has no fork-on-write rule - names are globally unique, so there
 * is no personal copy for a sample to be hidden behind. Its list is exactly
 * `Ownership.isVisibleTo`, which is why it reaches for `ownOrSampleWhere`
 * rather than the forkable libraries' `visibleRowsWhere`.
 */
const visibility = { id: equipment.id, userId: equipment.userId };

function toEquipment(row: EquipmentRow): Equipment {
  return Equipment.fromSnapshot({
    id: row.id,
    userId: row.userId,
    name: row.name,
    cardioKind: row.cardioKind,
    createdAt: row.createdAt,
  });
}

export class DrizzleEquipmentRepository implements EquipmentRepository {
  async listFor(userId: string, showSampleData: boolean): Promise<Equipment[]> {
    const rows = await dbScope
      .select()
      .from(equipment)
      .where(showSampleData ? ownOrSampleWhere(visibility, userId) : eq(equipment.userId, userId))
      .orderBy(asc(equipment.name));
    return rows.map(toEquipment);
  }

  async findById(equipmentId: string): Promise<Equipment | null> {
    const row = await dbScope.query.equipment.findFirst({
      where: eq(equipment.id, equipmentId),
    });
    return row ? toEquipment(row) : null;
  }

  async findManyByIds(equipmentIds: readonly string[]): Promise<Equipment[]> {
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
        set: { name: snapshot.name, cardioKind: snapshot.cardioKind },
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
