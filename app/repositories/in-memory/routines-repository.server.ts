import { Routine, type RoutineSnapshot } from '~/domain/routine/routine';
import { LibraryVisibility, Ownership } from '~/domain/shared/ownership';

import type { RoutinesRepository } from '../routines-repository.server';

// Dev-convenience adapter - see routines-repository.server.ts for when it's
// selected, and athletes-repository.in-memory.server.ts for why it stores
// snapshots rather than aggregates.
//
// It needs no handle on the templates repository: a `Routine` holds its
// slots' template *ids*, and resolving those to templates is a read model
// the service assembles, not something a routine carries.
export class InMemoryRoutinesRepository implements RoutinesRepository {
  private readonly byId = new Map<string, RoutineSnapshot>();

  async listFor(userId: string, showSampleData: boolean): Promise<Routine[]> {
    const visible = LibraryVisibility.for(userId, showSampleData).selectFrom([...this.byId.values()]);
    return visible.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()).map(Routine.fromSnapshot);
  }

  async findVisible(userId: string, routineId: string): Promise<Routine | null> {
    const snapshot = this.byId.get(routineId);
    if (!snapshot) return null;
    const visible = Ownership.fromUserId(snapshot.userId).isVisibleTo(userId);
    return visible ? Routine.fromSnapshot(snapshot) : null;
  }

  async findActive(userId: string): Promise<Routine | null> {
    const snapshot = [...this.byId.values()].find((candidate) => candidate.userId === userId && candidate.isActive);
    return snapshot ? Routine.fromSnapshot(snapshot) : null;
  }

  async findForkOf(userId: string, sampleId: string): Promise<Routine | null> {
    const snapshot = [...this.byId.values()].find(
      (candidate) => candidate.userId === userId && candidate.forkedFromId === sampleId,
    );
    return snapshot ? Routine.fromSnapshot(snapshot) : null;
  }

  async save(routine: Routine): Promise<void> {
    const snapshot = routine.toSnapshot();
    this.byId.set(snapshot.id, snapshot);
  }

  async delete(routineId: string): Promise<void> {
    this.byId.delete(routineId);
  }
}
