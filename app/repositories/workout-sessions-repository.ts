import type { Exercise, SessionSet, WorkoutSession } from "~/db/schema";

export type SessionSetWithExercise = SessionSet & { exercise: Exercise };

export type WorkoutSessionWithSets = WorkoutSession & {
  sets: SessionSetWithExercise[];
};

export type SessionContext = {
  routineId: string | null;
  templateId: string | null;
  isRestDay: boolean;
};

export type NewSessionSet = {
  reps?: number | null;
  weight?: number | null;
  durationSeconds?: number | null;
  speed?: number | null;
  resistanceLevel?: number | null;
};

export type RemoveSetOutcome = "removed" | "not-found";

// Port: consumers depend on this interface, not on Drizzle/Postgres
// directly. See workout-sessions-repository.server.ts for which adapter
// backs it at runtime.
export interface WorkoutSessionsRepository {
  // Idempotent: returns the existing session for (userId, dateStr) if one
  // already exists (the unique (userId, date) constraint is what makes
  // this an insert-then-read rather than needing its own lock), otherwise
  // creates it from `context`.
  getOrCreateForDate(
    userId: string,
    dateStr: string,
    context: SessionContext,
  ): Promise<{ session: WorkoutSession; created: boolean }>;
  findWithSetsForDate(
    userId: string,
    dateStr: string,
  ): Promise<WorkoutSessionWithSets | null>;
  listRecentWithSetsForUser(
    userId: string,
    limit: number,
  ): Promise<WorkoutSessionWithSets[]>;
  listForDateRange(
    userId: string,
    startDate: string,
    endDateExclusive: string,
  ): Promise<WorkoutSession[]>;
  // Flat (sessionId, exerciseId) pairs, one per logged set, for the given
  // sessions - enough for a caller to derive exercise/set counts per
  // session (see week-summary.server.ts's getPastWeekSummary).
  listSetSessionExercisePairs(
    sessionIds: string[],
  ): Promise<{ sessionId: string; exerciseId: string }[]>;
  // Assigns the next setNumber for (sessionId, exerciseId) itself.
  addSet(
    sessionId: string,
    exerciseId: string,
    input: NewSessionSet,
  ): Promise<SessionSet>;
  removeSetOwnedByUser(
    userId: string,
    setId: string,
  ): Promise<RemoveSetOutcome>;
}
