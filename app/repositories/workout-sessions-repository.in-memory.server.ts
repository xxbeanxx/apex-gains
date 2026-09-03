import { randomUUID } from "node:crypto";

import type { SessionSet, WorkoutSession } from "~/db/schema";

import type { ExercisesRepository } from "./exercises-repository";
import type {
  NewSessionSet,
  RemoveSetOutcome,
  SessionContext,
  WorkoutSessionsRepository,
  WorkoutSessionWithSets,
} from "./workout-sessions-repository";

// Dev-convenience adapter for running the app without a database
// configured (see workout-sessions-repository.server.ts for the selection
// rule). Data lives only for the life of the process.
export class InMemoryWorkoutSessionsRepository
  implements WorkoutSessionsRepository
{
  private readonly sessionsById = new Map<string, WorkoutSession>();
  private readonly setsById = new Map<string, SessionSet>();

  constructor(private readonly exercisesRepository: ExercisesRepository) {}

  async getOrCreateForDate(
    userId: string,
    dateStr: string,
    context: SessionContext,
  ): Promise<{ session: WorkoutSession; created: boolean }> {
    const existing = this.findByUserAndDate(userId, dateStr);
    if (existing) return { session: existing, created: false };

    const now = new Date();
    const session: WorkoutSession = {
      id: randomUUID(),
      userId,
      date: dateStr,
      routineId: context.routineId,
      templateId: context.templateId,
      isRestDay: context.isRestDay,
      createdAt: now,
      updatedAt: now,
    };
    this.sessionsById.set(session.id, session);
    return { session, created: true };
  }

  async findWithSetsForDate(
    userId: string,
    dateStr: string,
  ): Promise<WorkoutSessionWithSets | null> {
    const session = this.findByUserAndDate(userId, dateStr);
    if (!session) return null;
    return this.withSets(session);
  }

  async listRecentWithSetsForUser(
    userId: string,
    limit: number,
  ): Promise<WorkoutSessionWithSets[]> {
    const sessions = [...this.sessionsById.values()]
      .filter((s) => s.userId === userId)
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, limit);
    return Promise.all(sessions.map((s) => this.withSets(s)));
  }

  async listForDateRange(
    userId: string,
    startDate: string,
    endDateExclusive: string,
  ): Promise<WorkoutSession[]> {
    return [...this.sessionsById.values()].filter(
      (s) =>
        s.userId === userId && s.date >= startDate && s.date < endDateExclusive,
    );
  }

  async listSetSessionExercisePairs(
    sessionIds: string[],
  ): Promise<{ sessionId: string; exerciseId: string }[]> {
    const ids = new Set(sessionIds);
    return [...this.setsById.values()]
      .filter((set) => ids.has(set.sessionId))
      .map((set) => ({ sessionId: set.sessionId, exerciseId: set.exerciseId }));
  }

  async addSet(
    sessionId: string,
    exerciseId: string,
    input: NewSessionSet,
  ): Promise<SessionSet> {
    const setNumber =
      [...this.setsById.values()].filter(
        (s) => s.sessionId === sessionId && s.exerciseId === exerciseId,
      ).length + 1;
    const set: SessionSet = {
      id: randomUUID(),
      sessionId,
      exerciseId,
      setNumber,
      reps: input.reps ?? null,
      weight: input.weight != null ? String(input.weight) : null,
      durationSeconds: input.durationSeconds ?? null,
      speed: input.speed != null ? String(input.speed) : null,
      resistanceLevel: input.resistanceLevel ?? null,
      createdAt: new Date(),
    };
    this.setsById.set(set.id, set);
    return set;
  }

  async removeSetOwnedByUser(
    userId: string,
    setId: string,
  ): Promise<RemoveSetOutcome> {
    const set = this.setsById.get(setId);
    if (!set) return "not-found";
    const session = this.sessionsById.get(set.sessionId);
    if (!session || session.userId !== userId) return "not-found";

    this.setsById.delete(setId);
    return "removed";
  }

  private findByUserAndDate(
    userId: string,
    dateStr: string,
  ): WorkoutSession | undefined {
    return [...this.sessionsById.values()].find(
      (s) => s.userId === userId && s.date === dateStr,
    );
  }

  private async withSets(
    session: WorkoutSession,
  ): Promise<WorkoutSessionWithSets> {
    const sets = [...this.setsById.values()]
      .filter((s) => s.sessionId === session.id)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    const withExercise = await Promise.all(
      sets.map(async (set) => ({
        ...set,
        // A logged set always has a live exercise behind it - Postgres
        // enforces this with `onDelete: "restrict"`, which this adapter
        // doesn't replicate (see exercises-repository.in-memory).
        exercise: (await this.exercisesRepository.findById(set.exerciseId))!,
      })),
    );
    return { ...session, sets: withExercise };
  }
}
