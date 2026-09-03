import { and, desc, eq, gte, inArray, lt } from "drizzle-orm";

import { db } from "~/db/index.server";
import { sessionSets, workoutSessions } from "~/db/schema";

import type {
  NewSessionSet,
  RemoveSetOutcome,
  SessionContext,
  WorkoutSessionsRepository,
  WorkoutSessionWithSets,
} from "./workout-sessions-repository";

export class DrizzleWorkoutSessionsRepository
  implements WorkoutSessionsRepository
{
  async getOrCreateForDate(
    userId: string,
    dateStr: string,
    context: SessionContext,
  ) {
    const inserted = await db
      .insert(workoutSessions)
      .values({
        userId,
        date: dateStr,
        routineId: context.routineId,
        templateId: context.templateId,
        isRestDay: context.isRestDay,
      })
      .onConflictDoNothing({
        target: [workoutSessions.userId, workoutSessions.date],
      })
      .returning();
    if (inserted.length > 0) return { session: inserted[0], created: true };

    const [session] = await db
      .select()
      .from(workoutSessions)
      .where(
        and(
          eq(workoutSessions.userId, userId),
          eq(workoutSessions.date, dateStr),
        ),
      )
      .limit(1);
    return { session, created: false };
  }

  async findWithSetsForDate(
    userId: string,
    dateStr: string,
  ): Promise<WorkoutSessionWithSets | null> {
    const session = await db.query.workoutSessions.findFirst({
      where: (ws, { and, eq }) =>
        and(eq(ws.userId, userId), eq(ws.date, dateStr)),
      with: {
        sets: {
          with: { exercise: true },
          orderBy: (s, { asc }) => asc(s.createdAt),
        },
      },
    });
    return session ?? null;
  }

  async listRecentWithSetsForUser(
    userId: string,
    limit: number,
  ): Promise<WorkoutSessionWithSets[]> {
    return db.query.workoutSessions.findMany({
      where: eq(workoutSessions.userId, userId),
      orderBy: desc(workoutSessions.date),
      limit,
      with: {
        sets: {
          with: { exercise: true },
          orderBy: (s, { asc }) => asc(s.createdAt),
        },
      },
    });
  }

  async listForDateRange(
    userId: string,
    startDate: string,
    endDateExclusive: string,
  ) {
    return db
      .select()
      .from(workoutSessions)
      .where(
        and(
          eq(workoutSessions.userId, userId),
          gte(workoutSessions.date, startDate),
          lt(workoutSessions.date, endDateExclusive),
        ),
      );
  }

  async listSetSessionExercisePairs(sessionIds: string[]) {
    if (sessionIds.length === 0) return [];
    return db
      .select({
        sessionId: sessionSets.sessionId,
        exerciseId: sessionSets.exerciseId,
      })
      .from(sessionSets)
      .where(inArray(sessionSets.sessionId, sessionIds));
  }

  async addSet(sessionId: string, exerciseId: string, input: NewSessionSet) {
    const existingSets = await db
      .select()
      .from(sessionSets)
      .where(
        and(
          eq(sessionSets.sessionId, sessionId),
          eq(sessionSets.exerciseId, exerciseId),
        ),
      );

    const [set] = await db
      .insert(sessionSets)
      .values({
        sessionId,
        exerciseId,
        setNumber: existingSets.length + 1,
        reps: input.reps ?? null,
        weight: input.weight != null ? String(input.weight) : null,
        durationSeconds: input.durationSeconds ?? null,
        speed: input.speed != null ? String(input.speed) : null,
        resistanceLevel: input.resistanceLevel ?? null,
      })
      .returning();
    return set;
  }

  async removeSetOwnedByUser(
    userId: string,
    setId: string,
  ): Promise<RemoveSetOutcome> {
    const set = await db.query.sessionSets.findFirst({
      where: eq(sessionSets.id, setId),
      with: { session: true },
    });
    if (!set || set.session.userId !== userId) return "not-found";

    await db.delete(sessionSets).where(eq(sessionSets.id, setId));
    return "removed";
  }
}
