import type { WorkoutSession } from '../session/workout-session';
import { DateOnly } from '../values/date-only';
import { Weight } from '../values/weight';
import type { TrainingHistory } from './training-history';

export type WeeklyPoint<T> = {
  readonly weekStart: DateOnly;
  readonly value: T;
  readonly isCurrentWeek: boolean;
};

export type ConsistencyDay = {
  readonly date: DateOnly;
  readonly status: 'workout' | 'rest' | 'none';
  readonly setCount: number;
};

/**
 * Buckets sessions into the `weeks` Monday-aligned weeks ending with the one
 * containing `today`, oldest first.
 *
 * Weeks with nothing logged still appear, carrying `empty`, so a break in
 * training shows up as a gap in the chart rather than as a shorter axis -
 * that honesty is the point of the history page.
 */
function weekly<T>(
  history: TrainingHistory,
  weeks: number,
  today: DateOnly,
  empty: T,
  accumulate: (running: T, session: WorkoutSession) => T,
): WeeklyPoint<T>[] {
  const currentWeekStart = today.startOfWeek();
  const values = new Map<string, T>();

  const starts = Array.from({ length: weeks }, (_, i) => currentWeekStart.minusDays(7 * (weeks - 1 - i)));
  for (const start of starts) values.set(start.value, empty);

  for (const session of history.sessions) {
    const key = session.date.startOfWeek().value;
    const running = values.get(key);
    if (running !== undefined) values.set(key, accumulate(running, session));
  }

  // Every `start` was seeded into `values` above, so this lookup can never
  // miss - the check exists to keep that invariant explicit rather than
  // trusting it through a cast.
  return starts.map((weekStart) => {
    const value = values.get(weekStart.value);
    if (value === undefined) throw new Error(`missing bucket for week ${weekStart.value}`);
    return { weekStart, value, isCurrentWeek: weekStart.equals(currentWeekStart) };
  });
}

/** Sets logged per week - the simplest "am I still showing up" measure. */
export function weeklySetCount(history: TrainingHistory, weeks: number, today: DateOnly): WeeklyPoint<number>[] {
  return weekly(history, weeks, today, 0, (running, session) => running + session.setCount);
}

/** Weight moved per week. Sets without both a weight and a rep count add nothing. */
export function weeklyTonnage(history: TrainingHistory, weeks: number, today: DateOnly): WeeklyPoint<Weight>[] {
  return weekly(history, weeks, today, Weight.lb(0), (running, session) => running.plus(session.tonnage));
}

/**
 * One entry per day across the `weeks` weeks ending with the one containing
 * `today`, Monday-aligned so the caller can lay it out as a 7-row grid.
 */
export function consistencyCalendar(history: TrainingHistory, weeks: number, today: DateOnly): ConsistencyDay[] {
  const start = today.startOfWeek().minusDays(7 * (weeks - 1));
  const byDate = new Map(history.sessions.map((session) => [session.date.value, session]));

  return start.range(weeks * 7).map((date) => {
    const session = byDate.get(date.value);
    if (!session) return { date, status: 'none' as const, setCount: 0 };
    return {
      date,
      status: session.status,
      setCount: session.setCount,
    };
  });
}
