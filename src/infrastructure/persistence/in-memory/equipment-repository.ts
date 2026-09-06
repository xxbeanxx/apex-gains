import type { EquipmentRepository } from '~application/ports/persistence/equipment-repository';
import { Equipment, type EquipmentSnapshot } from '~domain/equipment/equipment';
import { Ownership } from '~domain/shared/ownership';

// Dev-convenience adapter - see equipment-repository.server.ts for when it's
// selected, and athletes-repository.in-memory.server.ts for why it stores
// snapshots rather than aggregates.
export class InMemoryEquipmentRepository implements EquipmentRepository {
  private readonly byId = new Map<string, EquipmentSnapshot>();

  /**
   * Equipment has no fork-on-write rule, so its list is `isVisibleTo`
   * narrowed by the athlete's sample-data preference - not the forkable
   * libraries' `LibraryVisibility`.
   */
  async listFor(userId: string, showSampleData: boolean): Promise<Equipment[]> {
    return [...this.byId.values()]
      .filter((snapshot) => {
        const ownership = Ownership.fromUserId(snapshot.userId);
        return showSampleData ? ownership.isVisibleTo(userId) : ownership.isOwnedBy(userId);
      })
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(Equipment.fromSnapshot);
  }

  async findById(equipmentId: string): Promise<Equipment | null> {
    const snapshot = this.byId.get(equipmentId);
    return snapshot ? Equipment.fromSnapshot(snapshot) : null;
  }

  async findManyByIds(equipmentIds: readonly string[]): Promise<Equipment[]> {
    return equipmentIds
      .map((id) => this.byId.get(id))
      .filter((snapshot): snapshot is EquipmentSnapshot => snapshot !== undefined)
      .map(Equipment.fromSnapshot);
  }

  async findByName(name: string): Promise<Equipment | null> {
    const snapshot = [...this.byId.values()].find((candidate) => candidate.name === name);
    return snapshot ? Equipment.fromSnapshot(snapshot) : null;
  }

  async save(item: Equipment): Promise<void> {
    const snapshot = item.toSnapshot();
    this.byId.set(snapshot.id, snapshot);
  }

  async delete(equipmentId: string): Promise<void> {
    this.byId.delete(equipmentId);
  }
}
