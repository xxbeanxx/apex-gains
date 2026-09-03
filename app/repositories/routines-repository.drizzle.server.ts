import {
  and,
  asc,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
  notInArray,
  or,
  type SQL,
} from "drizzle-orm";

import { db, dbScope } from "~/db/index.server";
import {
  routineSlots,
  routines,
  type Routine as RoutineRow,
  type RoutineSlot as RoutineSlotRow,
} from "~/db/schema";
import { Routine } from "~/domain/routine/routine";

import type { RoutinesRepository } from "./routines-repository";
import { diffChildren } from "./shared/diff-children";
import { writePositions } from "./shared/write-positions";

export function sampleOrOwnRoutinesWhere(
  userId: string,
  showSampleData: boolean,
): SQL {
  const ownCondition = eq(routines.userId, userId);
  if (!showSampleData) return ownCondition;
  const forkedSampleIds = db
    .select({ id: routines.forkedFromId })
    .from(routines)
    .where(and(eq(routines.userId, userId), isNotNull(routines.forkedFromId)));
  return or(
    ownCondition,
    and(isNull(routines.userId), notInArray(routines.id, forkedSampleIds)),
  )!;
}

function visibleToUserWhere(userId: string, routineId: string): SQL {
  return and(
    eq(routines.id, routineId),
    or(eq(routines.userId, userId), isNull(routines.userId)),
  )!;
}

type RowWithSlots = RoutineRow & { slots: RoutineSlotRow[] };

function toRoutine(row: RowWithSlots): Routine {
  return Routine.fromSnapshot({
    id: row.id,
    userId: row.userId,
    forkedFromId: row.forkedFromId,
    name: row.name,
    isActive: row.isActive,
    anchorDate: row.anchorDate,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    slots: row.slots.map((slot) => ({
      id: slot.id,
      position: slot.position,
      templateId: slot.templateId,
    })),
  });
}

export class DrizzleRoutinesRepository implements RoutinesRepository {
  async listFor(
    userId: string,
    showSampleData: boolean,
  ): Promise<Routine[]> {
    const rows = await dbScope.query.routines.findMany({
      where: sampleOrOwnRoutinesWhere(userId, showSampleData),
      orderBy: desc(routines.updatedAt),
      with: { slots: { orderBy: asc(routineSlots.position) } },
    });
    return rows.map(toRoutine);
  }

  async findVisible(
    userId: string,
    routineId: string,
  ): Promise<Routine | null> {
    const row = await dbScope.query.routines.findFirst({
      where: visibleToUserWhere(userId, routineId),
      with: { slots: { orderBy: asc(routineSlots.position) } },
    });
    return row ? toRoutine(row) : null;
  }

  async findActive(userId: string): Promise<Routine | null> {
    const row = await dbScope.query.routines.findFirst({
      where: and(eq(routines.userId, userId), eq(routines.isActive, true)),
      with: { slots: { orderBy: asc(routineSlots.position) } },
    });
    return row ? toRoutine(row) : null;
  }

  async findForkOf(
    userId: string,
    sampleId: string,
  ): Promise<Routine | null> {
    const row = await dbScope.query.routines.findFirst({
      where: and(
        eq(routines.userId, userId),
        eq(routines.forkedFromId, sampleId),
      ),
      with: { slots: { orderBy: asc(routineSlots.position) } },
    });
    return row ? toRoutine(row) : null;
  }

  /**
   * Writes the routine and its slots as one unit. Same ordering constraint
   * as templates - delete, then reposition through scratch values, then
   * insert - see DrizzleTemplatesRepository.save for why.
   */
  async save(routine: Routine): Promise<void> {
    const snapshot = routine.toSnapshot();

    await dbScope
      .insert(routines)
      .values({
        id: snapshot.id,
        userId: snapshot.userId,
        forkedFromId: snapshot.forkedFromId,
        name: snapshot.name,
        isActive: snapshot.isActive,
        anchorDate: snapshot.anchorDate,
        createdAt: snapshot.createdAt,
        updatedAt: snapshot.updatedAt,
      })
      .onConflictDoUpdate({
        target: routines.id,
        set: {
          name: snapshot.name,
          isActive: snapshot.isActive,
          anchorDate: snapshot.anchorDate,
          updatedAt: snapshot.updatedAt,
        },
      });

    const existing = await dbScope
      .select()
      .from(routineSlots)
      .where(eq(routineSlots.routineId, snapshot.id));

    const diff = diffChildren(existing, snapshot.slots);

    if (diff.deletedIds.length > 0) {
      await dbScope
        .delete(routineSlots)
        .where(inArray(routineSlots.id, diff.deletedIds));
    }

    for (const slot of diff.updated) {
      await dbScope
        .update(routineSlots)
        .set({ templateId: slot.templateId })
        .where(eq(routineSlots.id, slot.id));
    }

    await writePositions(
      new Map(existing.map((row) => [row.id, row.position])),
      diff.updated,
      (id, position) =>
        dbScope
          .update(routineSlots)
          .set({ position })
          .where(eq(routineSlots.id, id)),
    );

    if (diff.inserted.length > 0) {
      await dbScope.insert(routineSlots).values(
        diff.inserted.map((slot) => ({
          id: slot.id,
          routineId: snapshot.id,
          position: slot.position,
          templateId: slot.templateId,
        })),
      );
    }
  }

  async delete(routineId: string): Promise<void> {
    await dbScope.delete(routines).where(eq(routines.id, routineId));
  }
}
