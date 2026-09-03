import { and, asc, desc, eq, gte, inArray, lt } from "drizzle-orm";

import { dbScope } from "~/db/index.server";
import {
  sessionSets,
  workoutSessions,
  type SessionSet as SessionSetRow,
  type WorkoutSession as WorkoutSessionRow,
} from "~/db/schema";
import { WorkoutSession } from "~/domain/session/workout-session";
import type { DateOnly } from "~/domain/values/date-only";

import { diffChildren } from "./shared/diff-children";
import type { WorkoutSessionsRepository } from "./workout-sessions-repository";

type RowWithSets = WorkoutSessionRow & { sets: SessionSetRow[] };

function toSession(row: RowWithSets): WorkoutSession {
  return WorkoutSession.fromSnapshot({
    id: row.id,
    userId: row.userId,
    date: row.date,
    routineId: row.routineId,
    templateId: row.templateId,
    isRestDay: row.isRestDay,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    sets: row.sets.map((set) => ({
      id: set.id,
      exerciseId: set.exerciseId,
      setNumber: set.setNumber,
      reps: set.reps,
      weight: set.weight,
      durationSeconds: set.durationSeconds,
      speed: set.speed,
      resistanceLevel: set.resistanceLevel,
      createdAt: set.createdAt,
    })),
  });
}

const withSets = {
  sets: { orderBy: asc(sessionSets.createdAt) },
} as const;

export class DrizzleWorkoutSessionsRepository
  implements WorkoutSessionsRepository
{
  async findForDate(
    userId: string,
    date: DateOnly,
  ): Promise<WorkoutSession | null> {
    const row = await dbScope.query.workoutSessions.findFirst({
      where: and(
        eq(workoutSessions.userId, userId),
        eq(workoutSessions.date, date.value),
      ),
      with: withSets,
    });
    return row ? toSession(row) : null;
  }

  /**
   * Inserting is the lock: the `(userId, date)` unique constraint means two
   * requests opening the same day can't both win, so the loser reads back
   * the winner's session instead of failing. A freshly opened session has no
   * sets, hence the empty list on the insert path.
   */
  async add(session: WorkoutSession): Promise<WorkoutSession> {
    const snapshot = session.toSnapshot();

    const inserted = await dbScope
      .insert(workoutSessions)
      .values({
        id: snapshot.id,
        userId: snapshot.userId,
        date: snapshot.date,
        routineId: snapshot.routineId,
        templateId: snapshot.templateId,
        isRestDay: snapshot.isRestDay,
        createdAt: snapshot.createdAt,
        updatedAt: snapshot.updatedAt,
      })
      .onConflictDoNothing({
        target: [workoutSessions.userId, workoutSessions.date],
      })
      .returning();

    if (inserted.length > 0) return toSession({ ...inserted[0], sets: [] });

    const existing = await dbScope.query.workoutSessions.findFirst({
      where: and(
        eq(workoutSessions.userId, snapshot.userId),
        eq(workoutSessions.date, snapshot.date),
      ),
      with: withSets,
    });
    if (!existing) {
      // Neither inserted nor found: the row was deleted between the two
      // statements. Nothing sensible to return, and silently inventing a
      // session would hide a real problem.
      throw new Error(
        `Failed to open a workout session for ${snapshot.date}`,
      );
    }
    return toSession(existing);
  }

  async listRecent(
    userId: string,
    limit: number,
  ): Promise<WorkoutSession[]> {
    const rows = await dbScope.query.workoutSessions.findMany({
      where: eq(workoutSessions.userId, userId),
      orderBy: desc(workoutSessions.date),
      limit,
      with: withSets,
    });
    return rows.map(toSession);
  }

  async listForDateRange(
    userId: string,
    start: DateOnly,
    endExclusive: DateOnly,
  ): Promise<WorkoutSession[]> {
    const rows = await dbScope.query.workoutSessions.findMany({
      where: and(
        eq(workoutSessions.userId, userId),
        gte(workoutSessions.date, start.value),
        lt(workoutSessions.date, endExclusive.value),
      ),
      orderBy: asc(workoutSessions.date),
      with: withSets,
    });
    return rows.map(toSession);
  }

  /**
   * Only the root and the set collection change. A logged set is immutable
   * once recorded - `LoggedSet` has no mutators - so retained sets are never
   * updated, only added and removed.
   */
  async save(session: WorkoutSession): Promise<void> {
    const snapshot = session.toSnapshot();

    await dbScope
      .update(workoutSessions)
      .set({
        routineId: snapshot.routineId,
        templateId: snapshot.templateId,
        isRestDay: snapshot.isRestDay,
        updatedAt: snapshot.updatedAt,
      })
      .where(eq(workoutSessions.id, snapshot.id));

    const existing = await dbScope
      .select({ id: sessionSets.id })
      .from(sessionSets)
      .where(eq(sessionSets.sessionId, snapshot.id));

    const diff = diffChildren(existing, snapshot.sets);

    if (diff.deletedIds.length > 0) {
      await dbScope
        .delete(sessionSets)
        .where(inArray(sessionSets.id, diff.deletedIds));
    }

    if (diff.inserted.length > 0) {
      await dbScope.insert(sessionSets).values(
        diff.inserted.map((set) => ({
          id: set.id,
          sessionId: snapshot.id,
          exerciseId: set.exerciseId,
          setNumber: set.setNumber,
          reps: set.reps,
          weight: set.weight,
          durationSeconds: set.durationSeconds,
          speed: set.speed,
          resistanceLevel: set.resistanceLevel,
          createdAt: set.createdAt,
        })),
      );
    }
  }
}
