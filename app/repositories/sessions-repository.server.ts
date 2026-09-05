import type { LoggedSet } from '~/domain/session/logged-set';
import type { Session } from '~/domain/session/session';
import type { DateOnly } from '~/domain/values/date-only';

/**
 * What one athlete's training adds up to. `lastActiveOn` counts any day they
 * opened - a rest day is a decision they recorded, not a gap - while
 * `workoutCount` counts only the days they actually trained.
 */
export type TrainingTotals = {
  readonly workoutCount: number;
  readonly setCount: number;
  readonly lastActiveOn: DateOnly | null;
};

// Port: consumers depend on this interface, not on Drizzle/Postgres
// directly. `server/repositories/repositories.module.ts` picks which
// adapter backs it.
export interface SessionsRepository {
  findForDate(userId: string, date: DateOnly): Promise<Session | null>;
  /**
   * Inserts a newly opened session, or returns the one that already exists
   * for that day.
   *
   * Opening a day is idempotent, and two requests can race to do it - the
   * `(userId, date)` unique constraint is what settles that, so the adapter
   * resolves the conflict rather than callers taking a lock.
   */
  add(session: Session): Promise<Session>;
  listRecent(userId: string, limit: number): Promise<Session[]>;
  listForDateRange(userId: string, start: DateOnly, endExclusive: DateOnly): Promise<Session[]>;
  /**
   * The most recently logged sets for one exercise, newest first, across
   * every session - what "last time I did this" shows.
   */
  recentSetsForExercise(userId: string, exerciseId: string, limit: number): Promise<{ date: DateOnly; set: LoggedSet }[]>;
  /**
   * Every athlete's totals in one pass, keyed by user id - the numbers
   * /admin shows per account and sums for the whole instance. Athletes who
   * have never opened a day are absent rather than zeroed, so a caller with
   * the roster to hand supplies the zero itself.
   *
   * This is one of the two deliberately unscoped queries in the app (see
   * `AthletesRepository.listAll`); `requireAdminMiddleware` is what guards
   * the routes that reach it.
   */
  trainingTotals(): Promise<Map<string, TrainingTotals>>;
  save(session: Session): Promise<void>;
}
