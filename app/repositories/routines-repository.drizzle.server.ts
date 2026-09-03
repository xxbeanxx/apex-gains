import {
  and,
  asc,
  desc,
  eq,
  isNotNull,
  isNull,
  notInArray,
  or,
  type SQL,
} from "drizzle-orm";

import { db, type Transaction } from "~/db/index.server";
import { routineSlots, routines, type Routine, type RoutineSlot } from "~/db/schema";

import type {
  ActivateRoutineOutcome,
  AddSlotOutcome,
  DeactivateRoutineOutcome,
  DeleteRoutineOutcome,
  MoveSlotOutcome,
  ReanchorRoutineOutcome,
  RemoveSlotOutcome,
  RenameRoutineOutcome,
  RevertRoutineOutcome,
  RoutineDetail,
  RoutinesRepository,
  RoutineWithSlotCount,
} from "./routines-repository";

export function sampleOrOwnRoutinesWhere(
  userId: string,
  showSampleData: boolean,
): SQL {
  const ownCondition = eq(routines.userId, userId);
  if (!showSampleData) return ownCondition;
  const forkedSampleIds = db
    .select({ id: routines.forkedFromId })
    .from(routines)
    .where(
      and(eq(routines.userId, userId), isNotNull(routines.forkedFromId)),
    );
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

type LoadedRoutine = Routine & { slots: RoutineSlot[] };

async function loadForMutation(
  tx: Transaction,
  userId: string,
  routineId: string,
): Promise<LoadedRoutine | undefined> {
  return tx.query.routines.findFirst({
    where: visibleToUserWhere(userId, routineId),
    with: { slots: { orderBy: asc(routineSlots.position) } },
  });
}

// A sample (userId null) routine a user edits gets copied into a real,
// per-user row, including its slots - see CLAUDE.md's "Sample data and
// fork-on-write". Must run inside the same transaction as whatever
// mutation triggered the fork.
async function forkRoutineForUser(
  tx: Transaction,
  sample: LoadedRoutine,
  userId: string,
): Promise<{ fork: Routine; forkedSlots: RoutineSlot[] }> {
  const existingFork = await tx.query.routines.findFirst({
    where: and(
      eq(routines.userId, userId),
      eq(routines.forkedFromId, sample.id),
    ),
    with: { slots: { orderBy: asc(routineSlots.position) } },
  });
  if (existingFork) {
    return { fork: existingFork, forkedSlots: existingFork.slots };
  }

  const [fork] = await tx
    .insert(routines)
    .values({
      userId,
      forkedFromId: sample.id,
      name: sample.name,
      anchorDate: sample.anchorDate,
    })
    .returning();

  const sorted = [...sample.slots].sort((a, b) => a.position - b.position);
  const forkedSlots =
    sorted.length > 0
      ? await tx
          .insert(routineSlots)
          .values(
            sorted.map((slot) => ({
              routineId: fork.id,
              position: slot.position,
              templateId: slot.templateId,
            })),
          )
          .returning()
      : [];

  return { fork, forkedSlots };
}

// Every mutating method's first step: fork the routine if it's still a
// sample, and if a slotId was given, remap it onto the fork's copy of the
// same slot (matched by position). See
// TemplatesRepository's resolveActiveTemplate for the equivalent.
async function resolveActiveRoutine(
  tx: Transaction,
  routine: LoadedRoutine,
  userId: string,
  slotId: string | undefined,
): Promise<{
  activeRoutineId: string;
  forkedRoutineId: string | null;
  activeSlots: RoutineSlot[];
  remappedSlotId: string | undefined;
}> {
  if (routine.userId !== null) {
    return {
      activeRoutineId: routine.id,
      forkedRoutineId: null,
      activeSlots: routine.slots,
      remappedSlotId: slotId,
    };
  }

  const originalPosition = slotId
    ? routine.slots.find((s) => s.id === slotId)?.position
    : undefined;

  const { fork, forkedSlots } = await forkRoutineForUser(tx, routine, userId);

  const remappedSlotId =
    originalPosition !== undefined
      ? (forkedSlots.find((s) => s.position === originalPosition)?.id ?? slotId)
      : slotId;

  return {
    activeRoutineId: fork.id,
    forkedRoutineId: fork.id,
    activeSlots: forkedSlots,
    remappedSlotId,
  };
}

export class DrizzleRoutinesRepository implements RoutinesRepository {
  async listForUser(
    userId: string,
    showSampleData: boolean,
  ): Promise<RoutineWithSlotCount[]> {
    return db.query.routines.findMany({
      where: sampleOrOwnRoutinesWhere(userId, showSampleData),
      orderBy: desc(routines.updatedAt),
      with: { slots: true },
    });
  }

  async findVisibleForUser(
    userId: string,
    routineId: string,
  ): Promise<RoutineDetail | null> {
    const routine = await db.query.routines.findFirst({
      where: visibleToUserWhere(userId, routineId),
      with: {
        slots: {
          orderBy: asc(routineSlots.position),
          with: { template: true },
        },
      },
    });
    return routine ?? null;
  }

  async findActiveForUser(userId: string): Promise<RoutineDetail | null> {
    const routine = await db.query.routines.findFirst({
      where: and(eq(routines.userId, userId), eq(routines.isActive, true)),
      with: {
        slots: {
          orderBy: asc(routineSlots.position),
          with: { template: true },
        },
      },
    });
    return routine ?? null;
  }

  async create(
    userId: string,
    name: string,
    anchorDate: string,
  ): Promise<Routine> {
    const [routine] = await db
      .insert(routines)
      .values({ userId, name, anchorDate })
      .returning();
    return routine;
  }

  async delete(
    userId: string,
    routineId: string,
  ): Promise<DeleteRoutineOutcome> {
    const routine = await db.query.routines.findFirst({
      where: visibleToUserWhere(userId, routineId),
    });
    if (!routine) return { outcome: "not-found" };
    if (routine.userId === null) return { outcome: "sample-routine" };

    await db.delete(routines).where(eq(routines.id, routine.id));
    return { outcome: "deleted" };
  }

  async revert(
    userId: string,
    routineId: string,
  ): Promise<RevertRoutineOutcome> {
    const routine = await db.query.routines.findFirst({
      where: visibleToUserWhere(userId, routineId),
    });
    if (!routine) return { outcome: "not-found" };
    if (routine.userId !== userId || !routine.forkedFromId) {
      return { outcome: "nothing-to-revert" };
    }
    await db.delete(routines).where(eq(routines.id, routine.id));
    return { outcome: "reverted", forkedFromId: routine.forkedFromId };
  }

  async rename(
    userId: string,
    routineId: string,
    name: string,
  ): Promise<RenameRoutineOutcome> {
    return db.transaction(async (tx) => {
      const routine = await loadForMutation(tx, userId, routineId);
      if (!routine) return { outcome: "not-found" };

      const { activeRoutineId, forkedRoutineId } = await resolveActiveRoutine(
        tx,
        routine,
        userId,
        undefined,
      );

      await tx
        .update(routines)
        .set({ name, updatedAt: new Date() })
        .where(eq(routines.id, activeRoutineId));

      return { outcome: "renamed", forkedRoutineId };
    });
  }

  async reanchor(
    userId: string,
    routineId: string,
    anchorDate: string,
  ): Promise<ReanchorRoutineOutcome> {
    return db.transaction(async (tx) => {
      const routine = await loadForMutation(tx, userId, routineId);
      if (!routine) return { outcome: "not-found" };

      const { activeRoutineId, forkedRoutineId } = await resolveActiveRoutine(
        tx,
        routine,
        userId,
        undefined,
      );

      await tx
        .update(routines)
        .set({ anchorDate, updatedAt: new Date() })
        .where(eq(routines.id, activeRoutineId));

      return { outcome: "reanchored", forkedRoutineId };
    });
  }

  async activate(
    userId: string,
    routineId: string,
  ): Promise<ActivateRoutineOutcome> {
    return db.transaction(async (tx) => {
      const routine = await loadForMutation(tx, userId, routineId);
      if (!routine) return { outcome: "not-found" };

      const { activeRoutineId, forkedRoutineId } = await resolveActiveRoutine(
        tx,
        routine,
        userId,
        undefined,
      );

      await tx
        .update(routines)
        .set({ isActive: false, updatedAt: new Date() })
        .where(eq(routines.userId, userId));
      await tx
        .update(routines)
        .set({ isActive: true, updatedAt: new Date() })
        .where(eq(routines.id, activeRoutineId));

      return { outcome: "activated", forkedRoutineId };
    });
  }

  async deactivate(
    userId: string,
    routineId: string,
  ): Promise<DeactivateRoutineOutcome> {
    return db.transaction(async (tx) => {
      const routine = await loadForMutation(tx, userId, routineId);
      if (!routine) return { outcome: "not-found" };

      const { activeRoutineId, forkedRoutineId } = await resolveActiveRoutine(
        tx,
        routine,
        userId,
        undefined,
      );

      await tx
        .update(routines)
        .set({ isActive: false, updatedAt: new Date() })
        .where(eq(routines.id, activeRoutineId));

      return { outcome: "deactivated", forkedRoutineId };
    });
  }

  async addSlot(
    userId: string,
    routineId: string,
    templateId: string | null,
  ): Promise<AddSlotOutcome> {
    return db.transaction(async (tx) => {
      const routine = await loadForMutation(tx, userId, routineId);
      if (!routine) return { outcome: "not-found" };

      const { activeRoutineId, forkedRoutineId, activeSlots } =
        await resolveActiveRoutine(tx, routine, userId, undefined);

      const nextPosition =
        activeSlots.reduce((max, slot) => Math.max(max, slot.position), -1) +
        1;

      await tx.insert(routineSlots).values({
        routineId: activeRoutineId,
        position: nextPosition,
        templateId,
      });

      return { outcome: "added", forkedRoutineId };
    });
  }

  async removeSlot(
    userId: string,
    routineId: string,
    slotId: string,
  ): Promise<RemoveSlotOutcome> {
    return db.transaction(async (tx) => {
      const routine = await loadForMutation(tx, userId, routineId);
      if (!routine) return { outcome: "not-found" };

      const { forkedRoutineId, activeSlots, remappedSlotId } =
        await resolveActiveRoutine(tx, routine, userId, slotId);

      const removed = activeSlots.find((s) => s.id === remappedSlotId);
      if (!removed) return { outcome: "removed", forkedRoutineId };

      await tx.delete(routineSlots).where(eq(routineSlots.id, removed.id));
      const toShift = activeSlots
        .filter((s) => s.position > removed.position)
        .sort((a, b) => a.position - b.position);
      for (const slot of toShift) {
        await tx
          .update(routineSlots)
          .set({ position: slot.position - 1 })
          .where(eq(routineSlots.id, slot.id));
      }

      return { outcome: "removed", forkedRoutineId };
    });
  }

  async moveSlot(
    userId: string,
    routineId: string,
    slotId: string,
    direction: "up" | "down",
  ): Promise<MoveSlotOutcome> {
    return db.transaction(async (tx) => {
      const routine = await loadForMutation(tx, userId, routineId);
      if (!routine) return { outcome: "not-found" };

      const { forkedRoutineId, activeSlots, remappedSlotId } =
        await resolveActiveRoutine(tx, routine, userId, slotId);

      const sorted = [...activeSlots].sort((a, b) => a.position - b.position);
      const index = sorted.findIndex((s) => s.id === remappedSlotId);
      const swapIndex = direction === "up" ? index - 1 : index + 1;
      if (index === -1 || swapIndex < 0 || swapIndex >= sorted.length) {
        return { outcome: "no-op", forkedRoutineId };
      }
      const current = sorted[index];
      const swap = sorted[swapIndex];

      // Swap through a scratch value (-1) to dodge the
      // (routineId, position) unique constraint.
      await tx
        .update(routineSlots)
        .set({ position: -1 })
        .where(eq(routineSlots.id, current.id));
      await tx
        .update(routineSlots)
        .set({ position: current.position })
        .where(eq(routineSlots.id, swap.id));
      await tx
        .update(routineSlots)
        .set({ position: swap.position })
        .where(eq(routineSlots.id, current.id));

      return { outcome: "moved", forkedRoutineId };
    });
  }
}
