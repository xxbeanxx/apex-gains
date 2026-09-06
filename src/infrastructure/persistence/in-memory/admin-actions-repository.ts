import type { AdminActionsRepository } from '~application/ports/persistence/admin-actions-repository';
import { AdminAction, type AdminActionSnapshot } from '~domain/admin/admin-action';

import type { AthleteReferenced } from './references';

// Dev-convenience adapter - see admin-actions-repository.server.ts for when
// it's selected, and athletes-repository.in-memory.server.ts for why it
// stores snapshots rather than aggregates.
export class InMemoryAdminActionsRepository implements AdminActionsRepository, AthleteReferenced {
  private readonly byId = new Map<string, AdminActionSnapshot>();

  async record(action: AdminAction): Promise<void> {
    const snapshot = action.toSnapshot();
    this.byId.set(snapshot.id, snapshot);
  }

  async listRecent(limit: number): Promise<AdminAction[]> {
    return [...this.byId.values()]
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit)
      .map(AdminAction.fromSnapshot);
  }

  /** Mirrors the schema's `on delete set null`: the entries stay, only the id they can no longer resolve is cleared. */
  clearAthlete(userId: string): void {
    for (const [id, snapshot] of this.byId) {
      if (snapshot.actorId !== userId && snapshot.targetId !== userId) continue;
      this.byId.set(id, {
        ...snapshot,
        actorId: snapshot.actorId === userId ? null : snapshot.actorId,
        targetId: snapshot.targetId === userId ? null : snapshot.targetId,
      });
    }
  }
}
