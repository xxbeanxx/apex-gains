import type { Routine } from '~/domain/routine/routine';

// Port: consumers depend on this interface, not on Drizzle/Postgres
// directly. `server/repositories/repositories.module.ts` picks which
// adapter backs it.
//
// Shaped like TemplatesRepository: `save` writes the routine and its slots
// as one unit. The rules - fork on first edit, reordering, standing down the
// previously active routine - live on the `Routine` aggregate and in
// domain/routine/activation.ts.
export interface RoutinesRepository {
  listFor(userId: string, showSampleData: boolean): Promise<Routine[]>;
  findVisible(userId: string, routineId: string): Promise<Routine | null>;
  /** At most one per user - the partial unique index enforces it. */
  findActive(userId: string): Promise<Routine | null>;
  /**
   * The routine a share token names, whoever owns it.
   *
   * Deliberately unscoped by `userId`: the token *is* the authorization, and
   * the athlete importing a shared routine is by definition not its owner.
   * The token column is unique, so at most one row can answer.
   */
  findByShareToken(shareToken: string): Promise<Routine | null>;
  findForkOf(userId: string, sampleId: string): Promise<Routine | null>;
  save(routine: Routine): Promise<void>;
  delete(routineId: string): Promise<void>;
}
