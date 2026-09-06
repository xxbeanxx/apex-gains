import { and, asc, desc, eq, gte, inArray, lt, sql } from 'drizzle-orm';

import type { SessionsRepository, TrainingTotals } from '~application/ports/persistence/sessions-repository';
import { LoggedSet } from '~domain/session/logged-set';
import { Session } from '~domain/session/session';
import { DateOnly } from '~domain/values/date-only';
import { dbScope } from '~infrastructure/persistence/drizzle/index';
import {
  type Session as SessionRow,
  type SessionSet as SessionSetRow,
  sessionSets,
  sessions,
} from '~infrastructure/persistence/drizzle/schema';

import { diffChildren } from '../shared/diff-children';

type RowWithSets = SessionRow & { sets: SessionSetRow[] };

function toSession(row: RowWithSets): Session {
  return Session.fromSnapshot({
    id: row.id,
    userId: row.userId,
    date: row.date,
    planId: row.planId,
    workoutId: row.workoutId,
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
      notes: set.notes,
      rpe: set.rpe,
      createdAt: set.createdAt,
    })),
  });
}

const withSets = {
  sets: { orderBy: asc(sessionSets.createdAt) },
} as const;

export class DrizzleSessionsRepository implements SessionsRepository {
  async findForDate(userId: string, date: DateOnly): Promise<Session | null> {
    const row = await dbScope.query.sessions.findFirst({
      where: and(eq(sessions.userId, userId), eq(sessions.date, date.value)),
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
  async add(session: Session): Promise<Session> {
    const snapshot = session.toSnapshot();

    const inserted = await dbScope
      .insert(sessions)
      .values({
        id: snapshot.id,
        userId: snapshot.userId,
        date: snapshot.date,
        planId: snapshot.planId,
        workoutId: snapshot.workoutId,
        isRestDay: snapshot.isRestDay,
        createdAt: snapshot.createdAt,
        updatedAt: snapshot.updatedAt,
      })
      .onConflictDoNothing({
        target: [sessions.userId, sessions.date],
      })
      .returning();

    if (inserted.length > 0) return toSession({ ...inserted[0], sets: [] });

    const existing = await dbScope.query.sessions.findFirst({
      where: and(eq(sessions.userId, snapshot.userId), eq(sessions.date, snapshot.date)),
      with: withSets,
    });
    if (!existing) {
      // Neither inserted nor found: the row was deleted between the two
      // statements. Nothing sensible to return, and silently inventing a
      // session would hide a real problem.
      throw new Error(`Failed to open a workout session for ${snapshot.date}`);
    }
    return toSession(existing);
  }

  async listRecent(userId: string, limit: number): Promise<Session[]> {
    const rows = await dbScope.query.sessions.findMany({
      where: eq(sessions.userId, userId),
      orderBy: desc(sessions.date),
      limit,
      with: withSets,
    });
    return rows.map(toSession);
  }

  async listAll(userId: string): Promise<Session[]> {
    const rows = await dbScope.query.sessions.findMany({
      where: eq(sessions.userId, userId),
      orderBy: desc(sessions.date),
      with: withSets,
    });
    return rows.map(toSession);
  }

  async listForDateRange(userId: string, start: DateOnly, endExclusive: DateOnly): Promise<Session[]> {
    const rows = await dbScope.query.sessions.findMany({
      where: and(eq(sessions.userId, userId), gte(sessions.date, start.value), lt(sessions.date, endExclusive.value)),
      orderBy: asc(sessions.date),
      with: withSets,
    });
    return rows.map(toSession);
  }

  async recentSetsForExercise(
    userId: string,
    exerciseId: string,
    limit: number,
  ): Promise<{ date: DateOnly; set: LoggedSet }[]> {
    const rows = await dbScope
      .select({
        date: sessions.date,
        id: sessionSets.id,
        exerciseId: sessionSets.exerciseId,
        setNumber: sessionSets.setNumber,
        reps: sessionSets.reps,
        weight: sessionSets.weight,
        durationSeconds: sessionSets.durationSeconds,
        speed: sessionSets.speed,
        resistanceLevel: sessionSets.resistanceLevel,
        notes: sessionSets.notes,
        rpe: sessionSets.rpe,
        createdAt: sessionSets.createdAt,
      })
      .from(sessionSets)
      .innerJoin(sessions, eq(sessionSets.sessionId, sessions.id))
      .where(and(eq(sessions.userId, userId), eq(sessionSets.exerciseId, exerciseId)))
      .orderBy(desc(sessions.date), desc(sessionSets.createdAt))
      .limit(limit);

    return rows.map(({ date, ...set }) => ({
      date: DateOnly.parse(date),
      set: LoggedSet.fromSnapshot(set),
    }));
  }

  /**
   * `distinct on (exercise_id)` picks the one row per exercise that the
   * matching `order by` puts first - newest day, ties broken by newest
   * `created_at` - in a single pass over the athlete's sets rather than one
   * query per exercise.
   */
  async lastSetPerExercise(userId: string, beforeDate: DateOnly): Promise<Map<string, { date: DateOnly; set: LoggedSet }>> {
    const rows = await dbScope
      .selectDistinctOn([sessionSets.exerciseId], {
        date: sessions.date,
        id: sessionSets.id,
        exerciseId: sessionSets.exerciseId,
        setNumber: sessionSets.setNumber,
        reps: sessionSets.reps,
        weight: sessionSets.weight,
        durationSeconds: sessionSets.durationSeconds,
        speed: sessionSets.speed,
        resistanceLevel: sessionSets.resistanceLevel,
        notes: sessionSets.notes,
        rpe: sessionSets.rpe,
        createdAt: sessionSets.createdAt,
      })
      .from(sessionSets)
      .innerJoin(sessions, eq(sessionSets.sessionId, sessions.id))
      .where(and(eq(sessions.userId, userId), lt(sessions.date, beforeDate.value)))
      .orderBy(sessionSets.exerciseId, desc(sessions.date), desc(sessionSets.createdAt));

    return new Map(
      rows.map(({ date, ...set }) => [set.exerciseId, { date: DateOnly.parse(date), set: LoggedSet.fromSnapshot(set) }]),
    );
  }

  /**
   * One grouped pass over every session. The left join means a day with no
   * sets still contributes to the counts, and `count(distinct ...)` is what
   * keeps the join's row multiplication out of the session tally.
   */
  async trainingTotals(): Promise<Map<string, TrainingTotals>> {
    const rows = await dbScope
      .select({
        userId: sessions.userId,
        workoutCount: sql<number>`count(distinct ${sessions.id}) filter (where not ${sessions.isRestDay})`.mapWith(Number),
        setCount: sql<number>`count(${sessionSets.id})`.mapWith(Number),
        lastActiveOn: sql<string | null>`max(${sessions.date})`,
      })
      .from(sessions)
      .leftJoin(sessionSets, eq(sessionSets.sessionId, sessions.id))
      .groupBy(sessions.userId);

    return new Map(
      rows.map((row) => [
        row.userId,
        {
          workoutCount: row.workoutCount,
          setCount: row.setCount,
          lastActiveOn: row.lastActiveOn ? DateOnly.parse(row.lastActiveOn) : null,
        },
      ]),
    );
  }

  /**
   * Only the root and the set collection change. A logged set is immutable
   * once recorded - `LoggedSet` has no mutators - so retained sets are never
   * updated, only added and removed.
   */
  async save(session: Session): Promise<void> {
    const snapshot = session.toSnapshot();

    await dbScope
      .update(sessions)
      .set({
        planId: snapshot.planId,
        workoutId: snapshot.workoutId,
        isRestDay: snapshot.isRestDay,
        updatedAt: snapshot.updatedAt,
      })
      .where(eq(sessions.id, snapshot.id));

    const existing = await dbScope
      .select({ id: sessionSets.id })
      .from(sessionSets)
      .where(eq(sessionSets.sessionId, snapshot.id));

    const diff = diffChildren(existing, snapshot.sets);

    if (diff.deletedIds.length > 0) {
      await dbScope.delete(sessionSets).where(inArray(sessionSets.id, diff.deletedIds));
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
          notes: set.notes,
          rpe: set.rpe,
          createdAt: set.createdAt,
        })),
      );
    }
  }
}
