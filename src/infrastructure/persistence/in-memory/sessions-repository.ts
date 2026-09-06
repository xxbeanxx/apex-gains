import type { SessionsRepository, TrainingTotals } from '~application/ports/persistence/sessions-repository';
import { LoggedSet } from '~domain/session/logged-set';
import { Session, type SessionSnapshot } from '~domain/session/session';
import { DateOnly } from '~domain/values/date-only';
import type { AthleteOwned, ExerciseReferences } from '~infrastructure/persistence/in-memory/references';

// Dev-convenience adapter - see sessions-repository.server.ts for
// when it's selected, and athletes-repository.in-memory.server.ts for why it
// stores snapshots rather than aggregates.
export class InMemorySessionsRepository implements SessionsRepository, ExerciseReferences, AthleteOwned {
  private readonly byId = new Map<string, SessionSnapshot>();

  async findForDate(userId: string, date: DateOnly): Promise<Session | null> {
    const snapshot = this.snapshotForDate(userId, date.value);
    return snapshot ? Session.fromSnapshot(snapshot) : null;
  }

  /**
   * Single-threaded, so there is no race to resolve - the "already open"
   * branch only fires when the same day is genuinely opened twice.
   */
  async add(session: Session): Promise<Session> {
    const snapshot = session.toSnapshot();
    const existing = this.snapshotForDate(snapshot.userId, snapshot.date);
    if (existing) return Session.fromSnapshot(existing);

    this.byId.set(snapshot.id, snapshot);
    return Session.fromSnapshot(snapshot);
  }

  async listRecent(userId: string, limit: number): Promise<Session[]> {
    return [...this.byId.values()]
      .filter((snapshot) => snapshot.userId === userId)
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
      .slice(0, limit)
      .map(Session.fromSnapshot);
  }

  async listAll(userId: string): Promise<Session[]> {
    return [...this.byId.values()]
      .filter((snapshot) => snapshot.userId === userId)
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
      .map(Session.fromSnapshot);
  }

  async listForDateRange(userId: string, start: DateOnly, endExclusive: DateOnly): Promise<Session[]> {
    return [...this.byId.values()]
      .filter((snapshot) => snapshot.userId === userId && snapshot.date >= start.value && snapshot.date < endExclusive.value)
      .sort((a, b) => (a.date < b.date ? -1 : 1))
      .map(Session.fromSnapshot);
  }

  async recentSetsForExercise(
    userId: string,
    exerciseId: string,
    limit: number,
  ): Promise<{ date: DateOnly; set: LoggedSet }[]> {
    const entries: { date: DateOnly; set: LoggedSet }[] = [];
    for (const snapshot of this.byId.values()) {
      if (snapshot.userId !== userId) continue;
      for (const setSnapshot of snapshot.sets) {
        if (setSnapshot.exerciseId !== exerciseId) continue;
        entries.push({
          date: DateOnly.parse(snapshot.date),
          set: LoggedSet.fromSnapshot(setSnapshot),
        });
      }
    }

    entries.sort((a, b) => {
      if (a.date.value !== b.date.value) {
        return a.date.value < b.date.value ? 1 : -1;
      }
      return b.set.createdAt.getTime() - a.set.createdAt.getTime();
    });

    return entries.slice(0, limit);
  }

  async lastSetPerExercise(userId: string, beforeDate: DateOnly): Promise<Map<string, { date: DateOnly; set: LoggedSet }>> {
    const latest = new Map<string, { date: string; set: SessionSnapshot['sets'][number] }>();

    for (const snapshot of this.byId.values()) {
      if (snapshot.userId !== userId || snapshot.date >= beforeDate.value) continue;
      for (const setSnapshot of snapshot.sets) {
        const current = latest.get(setSnapshot.exerciseId);
        if (
          !current ||
          snapshot.date > current.date ||
          (snapshot.date === current.date && setSnapshot.createdAt.getTime() > current.set.createdAt.getTime())
        ) {
          latest.set(setSnapshot.exerciseId, { date: snapshot.date, set: setSnapshot });
        }
      }
    }

    return new Map(
      [...latest].map(([exerciseId, { date, set }]) => [
        exerciseId,
        { date: DateOnly.parse(date), set: LoggedSet.fromSnapshot(set) },
      ]),
    );
  }

  async trainingTotals(): Promise<Map<string, TrainingTotals>> {
    const totals = new Map<string, { workoutCount: number; setCount: number; lastActiveOn: string | null }>();

    for (const snapshot of this.byId.values()) {
      const running = totals.get(snapshot.userId) ?? { workoutCount: 0, setCount: 0, lastActiveOn: null };
      if (!snapshot.isRestDay) running.workoutCount += 1;
      running.setCount += snapshot.sets.length;
      if (running.lastActiveOn === null || snapshot.date > running.lastActiveOn) {
        running.lastActiveOn = snapshot.date;
      }
      totals.set(snapshot.userId, running);
    }

    return new Map(
      [...totals].map(([userId, running]) => [
        userId,
        { ...running, lastActiveOn: running.lastActiveOn ? DateOnly.parse(running.lastActiveOn) : null },
      ]),
    );
  }

  async save(session: Session): Promise<void> {
    const snapshot = session.toSnapshot();
    this.byId.set(snapshot.id, snapshot);
  }

  referencesExercise(exerciseId: string): boolean {
    return [...this.byId.values()].some((snapshot) => snapshot.sets.some((set) => set.exerciseId === exerciseId));
  }

  removeAllFor(userId: string): void {
    for (const [id, snapshot] of this.byId) {
      if (snapshot.userId === userId) this.byId.delete(id);
    }
  }

  private snapshotForDate(userId: string, date: string): SessionSnapshot | undefined {
    return [...this.byId.values()].find((snapshot) => snapshot.userId === userId && snapshot.date === date);
  }
}
