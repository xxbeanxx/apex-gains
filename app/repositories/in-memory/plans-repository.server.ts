import { Plan, type PlanSnapshot } from '~/domain/plan/plan';
import { LibraryVisibility, Ownership } from '~/domain/shared/ownership';

import type { PlansRepository } from '../plans-repository.server';
import type { AthleteOwned } from './references';

// Dev-convenience adapter - see plans-repository.server.ts for when it's
// selected, and athletes-repository.in-memory.server.ts for why it stores
// snapshots rather than aggregates.
//
// It needs no handle on the workouts repository: a `Plan` holds its
// slots' workout *ids*, and resolving those to workouts is a read model
// the service assembles, not something a plan carries.
export class InMemoryPlansRepository implements PlansRepository, AthleteOwned {
  private readonly byId = new Map<string, PlanSnapshot>();

  async listFor(userId: string, showSampleData: boolean): Promise<Plan[]> {
    const visible = LibraryVisibility.for(userId, showSampleData).selectFrom([...this.byId.values()]);
    return visible.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()).map(Plan.fromSnapshot);
  }

  async findVisible(userId: string, planId: string): Promise<Plan | null> {
    const snapshot = this.byId.get(planId);
    if (!snapshot) return null;
    const visible = Ownership.fromUserId(snapshot.userId).isVisibleTo(userId);
    return visible ? Plan.fromSnapshot(snapshot) : null;
  }

  async findActive(userId: string): Promise<Plan | null> {
    const snapshot = [...this.byId.values()].find((candidate) => candidate.userId === userId && candidate.isActive);
    return snapshot ? Plan.fromSnapshot(snapshot) : null;
  }

  async findByShareToken(shareToken: string): Promise<Plan | null> {
    const snapshot = [...this.byId.values()].find((candidate) => candidate.shareToken === shareToken);
    return snapshot ? Plan.fromSnapshot(snapshot) : null;
  }

  async findForkOf(userId: string, sampleId: string): Promise<Plan | null> {
    const snapshot = [...this.byId.values()].find(
      (candidate) => candidate.userId === userId && candidate.forkedFromId === sampleId,
    );
    return snapshot ? Plan.fromSnapshot(snapshot) : null;
  }

  async save(plan: Plan): Promise<void> {
    const snapshot = plan.toSnapshot();
    this.byId.set(snapshot.id, snapshot);
  }

  async delete(planId: string): Promise<void> {
    this.byId.delete(planId);
  }

  removeAllFor(userId: string): void {
    for (const [id, snapshot] of this.byId) {
      if (snapshot.userId === userId) this.byId.delete(id);
    }
  }
}
