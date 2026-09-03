import type { Routine, RoutineSlot, Template } from "~/db/schema";

export type RoutineWithSlotCount = Routine & {
  slots: { id: string; position: number }[];
};

export type RoutineSlotWithTemplate = RoutineSlot & { template: Template | null };

export type RoutineDetail = Routine & { slots: RoutineSlotWithTemplate[] };

export type RoutineNotFound = { outcome: "not-found" };

export type DeleteRoutineOutcome =
  | RoutineNotFound
  | { outcome: "sample-routine" }
  | { outcome: "deleted" };

export type RevertRoutineOutcome =
  | RoutineNotFound
  | { outcome: "nothing-to-revert" }
  | { outcome: "reverted"; forkedFromId: string };

export type RenameRoutineOutcome =
  | RoutineNotFound
  | { outcome: "renamed"; forkedRoutineId: string | null };

export type ReanchorRoutineOutcome =
  | RoutineNotFound
  | { outcome: "reanchored"; forkedRoutineId: string | null };

export type ActivateRoutineOutcome =
  | RoutineNotFound
  | { outcome: "activated"; forkedRoutineId: string | null };

export type DeactivateRoutineOutcome =
  | RoutineNotFound
  | { outcome: "deactivated"; forkedRoutineId: string | null };

export type AddSlotOutcome =
  | RoutineNotFound
  | { outcome: "added"; forkedRoutineId: string | null };

export type RemoveSlotOutcome =
  | RoutineNotFound
  | { outcome: "removed"; forkedRoutineId: string | null };

export type MoveSlotOutcome =
  | RoutineNotFound
  | { outcome: "moved"; forkedRoutineId: string | null }
  // Out-of-range move: still forks a sample routine first, same as every
  // other mutating intent, but doesn't reorder anything - matches the
  // route's existing behavior (see TemplatesRepository.moveExercise).
  | { outcome: "no-op"; forkedRoutineId: string | null };

// Port: consumers depend on this interface, not on Drizzle/Postgres
// directly. See routines-repository.server.ts for which adapter backs it
// at runtime.
//
// Shaped the same way as TemplatesRepository: every mutating method forks
// a sample (userId null) routine into a personal copy (with its slots)
// before applying its change, in the same transaction as the edit itself -
// see CLAUDE.md's "Sample data and fork-on-write". `forkedRoutineId` on the
// result is set when that happened, so the route can redirect to the
// fork's own URL.
export interface RoutinesRepository {
  listForUser(
    userId: string,
    showSampleData: boolean,
  ): Promise<RoutineWithSlotCount[]>;
  findVisibleForUser(
    userId: string,
    routineId: string,
  ): Promise<RoutineDetail | null>;
  findActiveForUser(userId: string): Promise<RoutineDetail | null>;
  create(userId: string, name: string, anchorDate: string): Promise<Routine>;
  delete(userId: string, routineId: string): Promise<DeleteRoutineOutcome>;
  revert(userId: string, routineId: string): Promise<RevertRoutineOutcome>;
  rename(
    userId: string,
    routineId: string,
    name: string,
  ): Promise<RenameRoutineOutcome>;
  reanchor(
    userId: string,
    routineId: string,
    anchorDate: string,
  ): Promise<ReanchorRoutineOutcome>;
  // Deactivates every other routine this user owns first, enforcing "only
  // one active routine per user".
  activate(
    userId: string,
    routineId: string,
  ): Promise<ActivateRoutineOutcome>;
  deactivate(
    userId: string,
    routineId: string,
  ): Promise<DeactivateRoutineOutcome>;
  addSlot(
    userId: string,
    routineId: string,
    templateId: string | null,
  ): Promise<AddSlotOutcome>;
  // Shifts every later slot's position down by one, closing the gap.
  removeSlot(
    userId: string,
    routineId: string,
    slotId: string,
  ): Promise<RemoveSlotOutcome>;
  moveSlot(
    userId: string,
    routineId: string,
    slotId: string,
    direction: "up" | "down",
  ): Promise<MoveSlotOutcome>;
}
