import { LoggedSet } from "~/domain/session/logged-set";
import {
  WorkoutSession,
  type WorkoutSessionSnapshot,
} from "~/domain/session/workout-session";
import { DateOnly } from "~/domain/values/date-only";

import type { WorkoutSessionsRepository } from "../workout-sessions-repository.server";

// Dev-convenience adapter - see workout-sessions-repository.server.ts for
// when it's selected, and athletes-repository.in-memory.server.ts for why it
// stores snapshots rather than aggregates.
export class InMemoryWorkoutSessionsRepository
  implements WorkoutSessionsRepository
{
  private readonly byId = new Map<string, WorkoutSessionSnapshot>();

  async findForDate(
    userId: string,
    date: DateOnly,
  ): Promise<WorkoutSession | null> {
    const snapshot = this.snapshotForDate(userId, date.value);
    return snapshot ? WorkoutSession.fromSnapshot(snapshot) : null;
  }

  /**
   * Single-threaded, so there is no race to resolve - the "already open"
   * branch only fires when the same day is genuinely opened twice.
   */
  async add(session: WorkoutSession): Promise<WorkoutSession> {
    const snapshot = session.toSnapshot();
    const existing = this.snapshotForDate(snapshot.userId, snapshot.date);
    if (existing) return WorkoutSession.fromSnapshot(existing);

    this.byId.set(snapshot.id, snapshot);
    return WorkoutSession.fromSnapshot(snapshot);
  }

  async listRecent(
    userId: string,
    limit: number,
  ): Promise<WorkoutSession[]> {
    return [...this.byId.values()]
      .filter((snapshot) => snapshot.userId === userId)
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
      .slice(0, limit)
      .map(WorkoutSession.fromSnapshot);
  }

  async listForDateRange(
    userId: string,
    start: DateOnly,
    endExclusive: DateOnly,
  ): Promise<WorkoutSession[]> {
    return [...this.byId.values()]
      .filter(
        (snapshot) =>
          snapshot.userId === userId &&
          snapshot.date >= start.value &&
          snapshot.date < endExclusive.value,
      )
      .sort((a, b) => (a.date < b.date ? -1 : 1))
      .map(WorkoutSession.fromSnapshot);
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

  async save(session: WorkoutSession): Promise<void> {
    const snapshot = session.toSnapshot();
    this.byId.set(snapshot.id, snapshot);
  }

  private snapshotForDate(
    userId: string,
    date: string,
  ): WorkoutSessionSnapshot | undefined {
    return [...this.byId.values()].find(
      (snapshot) => snapshot.userId === userId && snapshot.date === date,
    );
  }
}
