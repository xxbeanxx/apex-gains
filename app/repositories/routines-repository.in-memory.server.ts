import { randomUUID } from "node:crypto";

import type { Routine, RoutineSlot, Template } from "~/db/schema";

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
import type { TemplatesRepository } from "./templates-repository";

function isVisible(routine: Routine, userId: string): boolean {
  return routine.userId === userId || routine.userId === null;
}

// Dev-convenience adapter for running the app without a database
// configured (see routines-repository.server.ts for the selection rule).
// Data lives only for the life of the process. Like the templates
// in-memory adapter, its fork-on-write path is presently unreachable:
// there's no in-memory equivalent of db/seed.ts, so nothing ever produces
// a sample (userId null) routine here.
export class InMemoryRoutinesRepository implements RoutinesRepository {
  private readonly routinesById = new Map<string, Routine>();
  private readonly slotsById = new Map<string, RoutineSlot>();

  constructor(private readonly templatesRepository: TemplatesRepository) {}

  async listForUser(
    userId: string,
    showSampleData: boolean,
  ): Promise<RoutineWithSlotCount[]> {
    const all = [...this.routinesById.values()];
    const ownRows = all.filter((row) => row.userId === userId);
    const forkedSampleIds = new Set(
      ownRows
        .map((row) => row.forkedFromId)
        .filter((id): id is string => id !== null),
    );
    const rows = showSampleData
      ? [
          ...ownRows,
          ...all.filter(
            (row) => row.userId === null && !forkedSampleIds.has(row.id),
          ),
        ]
      : ownRows;

    return rows
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
      .map((routine) => ({
        ...routine,
        slots: this.slotsFor(routine.id).map((s) => ({
          id: s.id,
          position: s.position,
        })),
      }));
  }

  async findVisibleForUser(
    userId: string,
    routineId: string,
  ): Promise<RoutineDetail | null> {
    const routine = this.routinesById.get(routineId);
    if (!routine || !isVisible(routine, userId)) return null;
    return this.buildDetail(userId, routine);
  }

  async findActiveForUser(userId: string): Promise<RoutineDetail | null> {
    const routine = [...this.routinesById.values()].find(
      (row) => row.userId === userId && row.isActive,
    );
    if (!routine) return null;
    return this.buildDetail(userId, routine);
  }

  private async buildDetail(
    userId: string,
    routine: Routine,
  ): Promise<RoutineDetail> {
    const sorted = this.slotsFor(routine.id).sort(
      (a, b) => a.position - b.position,
    );
    const slots = await Promise.all(
      sorted.map(async (slot) => ({
        ...slot,
        template: slot.templateId
          ? await this.findTemplate(userId, slot.templateId)
          : null,
      })),
    );
    return { ...routine, slots };
  }

  async create(
    userId: string,
    name: string,
    anchorDate: string,
  ): Promise<Routine> {
    const now = new Date();
    const routine: Routine = {
      id: randomUUID(),
      userId,
      forkedFromId: null,
      name,
      isActive: false,
      anchorDate,
      createdAt: now,
      updatedAt: now,
    };
    this.routinesById.set(routine.id, routine);
    return routine;
  }

  async delete(
    userId: string,
    routineId: string,
  ): Promise<DeleteRoutineOutcome> {
    const routine = this.routinesById.get(routineId);
    if (!routine || !isVisible(routine, userId)) {
      return { outcome: "not-found" };
    }
    if (routine.userId === null) return { outcome: "sample-routine" };

    this.routinesById.delete(routineId);
    this.deleteSlotsFor(routineId);
    return { outcome: "deleted" };
  }

  async revert(
    userId: string,
    routineId: string,
  ): Promise<RevertRoutineOutcome> {
    const routine = this.routinesById.get(routineId);
    if (!routine || !isVisible(routine, userId)) {
      return { outcome: "not-found" };
    }
    if (routine.userId !== userId || !routine.forkedFromId) {
      return { outcome: "nothing-to-revert" };
    }
    this.routinesById.delete(routineId);
    this.deleteSlotsFor(routineId);
    return { outcome: "reverted", forkedFromId: routine.forkedFromId };
  }

  async rename(
    userId: string,
    routineId: string,
    name: string,
  ): Promise<RenameRoutineOutcome> {
    const routine = this.routinesById.get(routineId);
    if (!routine || !isVisible(routine, userId)) {
      return { outcome: "not-found" };
    }

    const { activeRoutineId, forkedRoutineId } = this.resolveActiveRoutine(
      routine,
      userId,
      undefined,
    );
    const active = this.routinesById.get(activeRoutineId)!;
    this.routinesById.set(activeRoutineId, {
      ...active,
      name,
      updatedAt: new Date(),
    });
    return { outcome: "renamed", forkedRoutineId };
  }

  async reanchor(
    userId: string,
    routineId: string,
    anchorDate: string,
  ): Promise<ReanchorRoutineOutcome> {
    const routine = this.routinesById.get(routineId);
    if (!routine || !isVisible(routine, userId)) {
      return { outcome: "not-found" };
    }

    const { activeRoutineId, forkedRoutineId } = this.resolveActiveRoutine(
      routine,
      userId,
      undefined,
    );
    const active = this.routinesById.get(activeRoutineId)!;
    this.routinesById.set(activeRoutineId, {
      ...active,
      anchorDate,
      updatedAt: new Date(),
    });
    return { outcome: "reanchored", forkedRoutineId };
  }

  async activate(
    userId: string,
    routineId: string,
  ): Promise<ActivateRoutineOutcome> {
    const routine = this.routinesById.get(routineId);
    if (!routine || !isVisible(routine, userId)) {
      return { outcome: "not-found" };
    }

    const { activeRoutineId, forkedRoutineId } = this.resolveActiveRoutine(
      routine,
      userId,
      undefined,
    );

    for (const row of this.routinesById.values()) {
      if (row.userId === userId && row.isActive) {
        this.routinesById.set(row.id, {
          ...row,
          isActive: false,
          updatedAt: new Date(),
        });
      }
    }
    const active = this.routinesById.get(activeRoutineId)!;
    this.routinesById.set(activeRoutineId, {
      ...active,
      isActive: true,
      updatedAt: new Date(),
    });
    return { outcome: "activated", forkedRoutineId };
  }

  async deactivate(
    userId: string,
    routineId: string,
  ): Promise<DeactivateRoutineOutcome> {
    const routine = this.routinesById.get(routineId);
    if (!routine || !isVisible(routine, userId)) {
      return { outcome: "not-found" };
    }

    const { activeRoutineId, forkedRoutineId } = this.resolveActiveRoutine(
      routine,
      userId,
      undefined,
    );
    const active = this.routinesById.get(activeRoutineId)!;
    this.routinesById.set(activeRoutineId, {
      ...active,
      isActive: false,
      updatedAt: new Date(),
    });
    return { outcome: "deactivated", forkedRoutineId };
  }

  async addSlot(
    userId: string,
    routineId: string,
    templateId: string | null,
  ): Promise<AddSlotOutcome> {
    const routine = this.routinesById.get(routineId);
    if (!routine || !isVisible(routine, userId)) {
      return { outcome: "not-found" };
    }

    const { activeRoutineId, forkedRoutineId, activeSlots } =
      this.resolveActiveRoutine(routine, userId, undefined);

    const nextPosition =
      activeSlots.reduce((max, slot) => Math.max(max, slot.position), -1) + 1;
    const slot: RoutineSlot = {
      id: randomUUID(),
      routineId: activeRoutineId,
      position: nextPosition,
      templateId,
    };
    this.slotsById.set(slot.id, slot);
    return { outcome: "added", forkedRoutineId };
  }

  async removeSlot(
    userId: string,
    routineId: string,
    slotId: string,
  ): Promise<RemoveSlotOutcome> {
    const routine = this.routinesById.get(routineId);
    if (!routine || !isVisible(routine, userId)) {
      return { outcome: "not-found" };
    }

    const { forkedRoutineId, activeSlots, remappedSlotId } =
      this.resolveActiveRoutine(routine, userId, slotId);

    const removed = activeSlots.find((s) => s.id === remappedSlotId);
    if (!removed) return { outcome: "removed", forkedRoutineId };

    this.slotsById.delete(removed.id);
    for (const slot of activeSlots) {
      if (slot.position > removed.position) {
        this.slotsById.set(slot.id, { ...slot, position: slot.position - 1 });
      }
    }
    return { outcome: "removed", forkedRoutineId };
  }

  async moveSlot(
    userId: string,
    routineId: string,
    slotId: string,
    direction: "up" | "down",
  ): Promise<MoveSlotOutcome> {
    const routine = this.routinesById.get(routineId);
    if (!routine || !isVisible(routine, userId)) {
      return { outcome: "not-found" };
    }

    const { forkedRoutineId, activeSlots, remappedSlotId } =
      this.resolveActiveRoutine(routine, userId, slotId);

    const sorted = [...activeSlots].sort((a, b) => a.position - b.position);
    const index = sorted.findIndex((s) => s.id === remappedSlotId);
    const swapIndex = direction === "up" ? index - 1 : index + 1;
    if (index === -1 || swapIndex < 0 || swapIndex >= sorted.length) {
      return { outcome: "no-op", forkedRoutineId };
    }
    const current = sorted[index];
    const swap = sorted[swapIndex];
    this.slotsById.set(current.id, { ...current, position: swap.position });
    this.slotsById.set(swap.id, { ...swap, position: current.position });
    return { outcome: "moved", forkedRoutineId };
  }

  private resolveActiveRoutine(
    routine: Routine,
    userId: string,
    slotId: string | undefined,
  ): {
    activeRoutineId: string;
    forkedRoutineId: string | null;
    activeSlots: RoutineSlot[];
    remappedSlotId: string | undefined;
  } {
    const slots = this.slotsFor(routine.id);
    if (routine.userId !== null) {
      return {
        activeRoutineId: routine.id,
        forkedRoutineId: null,
        activeSlots: slots,
        remappedSlotId: slotId,
      };
    }

    const originalPosition = slotId
      ? slots.find((s) => s.id === slotId)?.position
      : undefined;

    const { fork, forkedSlots } = this.forkForUser(routine, userId);

    const remappedSlotId =
      originalPosition !== undefined
        ? (forkedSlots.find((s) => s.position === originalPosition)?.id ??
          slotId)
        : slotId;

    return {
      activeRoutineId: fork.id,
      forkedRoutineId: fork.id,
      activeSlots: forkedSlots,
      remappedSlotId,
    };
  }

  private forkForUser(
    sample: Routine,
    userId: string,
  ): { fork: Routine; forkedSlots: RoutineSlot[] } {
    const existingFork = [...this.routinesById.values()].find(
      (row) => row.userId === userId && row.forkedFromId === sample.id,
    );
    if (existingFork) {
      return {
        fork: existingFork,
        forkedSlots: this.slotsFor(existingFork.id),
      };
    }

    const now = new Date();
    const fork: Routine = {
      ...sample,
      id: randomUUID(),
      userId,
      forkedFromId: sample.id,
      isActive: false,
      createdAt: now,
      updatedAt: now,
    };
    this.routinesById.set(fork.id, fork);

    const sorted = this.slotsFor(sample.id).sort(
      (a, b) => a.position - b.position,
    );
    const forkedSlots = sorted.map((slot) => {
      const forked: RoutineSlot = { ...slot, id: randomUUID(), routineId: fork.id };
      this.slotsById.set(forked.id, forked);
      return forked;
    });

    return { fork, forkedSlots };
  }

  private async findTemplate(
    userId: string,
    templateId: string,
  ): Promise<Template | null> {
    return this.templatesRepository.findVisibleForUser(userId, templateId);
  }

  private slotsFor(routineId: string): RoutineSlot[] {
    return [...this.slotsById.values()].filter(
      (s) => s.routineId === routineId,
    );
  }

  private deleteSlotsFor(routineId: string): void {
    for (const slot of this.slotsFor(routineId)) {
      this.slotsById.delete(slot.id);
    }
  }
}
