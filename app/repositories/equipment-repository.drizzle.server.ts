import { and, asc, eq, isNull, or, type SQL } from "drizzle-orm";

import { db } from "~/db/index.server";
import { equipment } from "~/db/schema";

import type { EquipmentRepository } from "./equipment-repository";

// Unlike exercises/templates/routines, equipment has no fork tracking -
// every sample row is shown regardless of what the user has forked.
export function sampleOrOwnEquipmentWhere(
  userId: string,
  showSampleData: boolean,
): SQL {
  const ownCondition = eq(equipment.userId, userId);
  if (!showSampleData) return ownCondition;
  return or(ownCondition, isNull(equipment.userId))!;
}

export class DrizzleEquipmentRepository implements EquipmentRepository {
  async listForUser(userId: string, showSampleData: boolean) {
    return db
      .select()
      .from(equipment)
      .where(sampleOrOwnEquipmentWhere(userId, showSampleData))
      .orderBy(asc(equipment.name));
  }

  async findById(equipmentId: string) {
    const [row] = await db
      .select()
      .from(equipment)
      .where(eq(equipment.id, equipmentId))
      .limit(1);
    return row ?? null;
  }

  async add(userId: string, name: string) {
    await db
      .insert(equipment)
      .values({ userId, name })
      .onConflictDoNothing({ target: equipment.name });
  }

  async remove(userId: string, equipmentId: string) {
    await db
      .delete(equipment)
      .where(and(eq(equipment.id, equipmentId), eq(equipment.userId, userId)));
  }
}
