import type { Routine } from "~/domain/routine/routine";

// Port: consumers depend on this interface, not on Drizzle/Postgres
// directly. See routines-repository.server.ts for which adapter backs it at
// runtime.
//
// Shaped like TemplatesRepository: `save` writes the routine and its slots
// as one unit, and the rules that used to live in the adapters (fork on
// first edit, reordering, standing down the previously active routine) are
// on the `Routine` aggregate and in domain/routine/activation.ts.
export interface RoutinesRepository {
  listFor(userId: string, showSampleData: boolean): Promise<Routine[]>;
  findVisible(userId: string, routineId: string): Promise<Routine | null>;
  /** At most one per user - the partial unique index enforces it. */
  findActive(userId: string): Promise<Routine | null>;
  findForkOf(userId: string, sampleId: string): Promise<Routine | null>;
  save(routine: Routine): Promise<void>;
  delete(routineId: string): Promise<void>;
}
