import type { Plan } from '~/domain/plan/plan';

// Port: consumers depend on this interface, not on Drizzle/Postgres
// directly. `server/repositories/repositories.module.ts` picks which
// adapter backs it.
//
// Shaped like WorkoutsRepository: `save` writes the plan and its slots
// as one unit. The rules - fork on first edit, reordering, standing down the
// previously active plan - live on the `Plan` aggregate and in
// domain/plan/activation.ts.
export interface PlansRepository {
  listFor(userId: string, showSampleData: boolean): Promise<Plan[]>;
  findVisible(userId: string, planId: string): Promise<Plan | null>;
  /** At most one per user - the partial unique index enforces it. */
  findActive(userId: string): Promise<Plan | null>;
  /**
   * The plan a share token names, whoever owns it.
   *
   * Deliberately unscoped by `userId`: the token *is* the authorization, and
   * the athlete importing a shared plan is by definition not its owner.
   * The token column is unique, so at most one row can answer.
   */
  findByShareToken(shareToken: string): Promise<Plan | null>;
  findForkOf(userId: string, sampleId: string): Promise<Plan | null>;
  save(plan: Plan): Promise<void>;
  delete(planId: string): Promise<void>;
}
