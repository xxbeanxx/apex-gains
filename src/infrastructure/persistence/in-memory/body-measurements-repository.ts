import type { BodyMeasurementsRepository } from '~application/ports/persistence/body-measurements-repository';
import { BodyMeasurement, type BodyMeasurementMetric, type BodyMeasurementSnapshot } from '~domain/body/body-measurement';
import type { DateOnly } from '~domain/values/date-only';

import type { AthleteOwned } from './references';

// Dev-convenience adapter - see body-measurements-repository.server.ts for
// when it's selected, and athletes-repository.in-memory.server.ts for why it
// stores snapshots rather than aggregates.
export class InMemoryBodyMeasurementsRepository implements BodyMeasurementsRepository, AthleteOwned {
  private readonly byId = new Map<string, BodyMeasurementSnapshot>();

  async findForDate(userId: string, date: DateOnly, metric: BodyMeasurementMetric): Promise<BodyMeasurement | null> {
    const snapshot = [...this.byId.values()].find(
      (candidate) => candidate.userId === userId && candidate.date === date.value && candidate.metric === metric,
    );
    return snapshot ? BodyMeasurement.fromSnapshot(snapshot) : null;
  }

  async listRecent(userId: string, metric: BodyMeasurementMetric, limit: number): Promise<BodyMeasurement[]> {
    return [...this.byId.values()]
      .filter((snapshot) => snapshot.userId === userId && snapshot.metric === metric)
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
      .slice(0, limit)
      .map(BodyMeasurement.fromSnapshot);
  }

  async listAll(userId: string): Promise<BodyMeasurement[]> {
    return [...this.byId.values()]
      .filter((snapshot) => snapshot.userId === userId)
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
      .map(BodyMeasurement.fromSnapshot);
  }

  async save(entry: BodyMeasurement): Promise<void> {
    const snapshot = entry.toSnapshot();
    this.byId.set(snapshot.id, snapshot);
  }

  async delete(entryId: string): Promise<void> {
    this.byId.delete(entryId);
  }

  removeAllFor(userId: string): void {
    for (const [id, snapshot] of this.byId) {
      if (snapshot.userId === userId) this.byId.delete(id);
    }
  }
}
