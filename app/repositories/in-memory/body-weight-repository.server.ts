import { BodyWeightEntry, type BodyWeightEntrySnapshot } from '~/domain/bodyweight/body-weight-entry';
import type { DateOnly } from '~/domain/values/date-only';

import type { BodyWeightRepository } from '../body-weight-repository.server';

// Dev-convenience adapter - see body-weight-repository.server.ts for when
// it's selected, and athletes-repository.in-memory.server.ts for why it
// stores snapshots rather than aggregates.
export class InMemoryBodyWeightRepository implements BodyWeightRepository {
  private readonly byId = new Map<string, BodyWeightEntrySnapshot>();

  async findForDate(userId: string, date: DateOnly): Promise<BodyWeightEntry | null> {
    const snapshot = [...this.byId.values()].find((candidate) => candidate.userId === userId && candidate.date === date.value);
    return snapshot ? BodyWeightEntry.fromSnapshot(snapshot) : null;
  }

  async listRecent(userId: string, limit: number): Promise<BodyWeightEntry[]> {
    return [...this.byId.values()]
      .filter((snapshot) => snapshot.userId === userId)
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
      .slice(0, limit)
      .map(BodyWeightEntry.fromSnapshot);
  }

  async save(entry: BodyWeightEntry): Promise<void> {
    const snapshot = entry.toSnapshot();
    this.byId.set(snapshot.id, snapshot);
  }

  async delete(entryId: string): Promise<void> {
    this.byId.delete(entryId);
  }
}
