import type { DomainDeps } from '~application/ports/domain-deps';
import type { ExercisesRepository } from '~application/ports/persistence/exercises-repository';
import type { SessionsRepository } from '~application/ports/persistence/sessions-repository';
import type { UnitOfWork } from '~application/ports/persistence/unit-of-work';
import { AthleteCalendar } from '~application/shared/athlete-calendar';
import { type DaySchedule, sessionPlanOf } from '~application/shared/day-schedule';
import { type MeasurementInput, toCanonical, toValues } from '~application/shared/measurement-values';
import type { ReferenceDirectory } from '~application/shared/reference-directory';
import type { Athlete } from '~domain/athlete/athlete';
import type { AthletePreferences } from '~domain/athlete/preferences';
import type { LoggedSet } from '~domain/session/logged-set';
import { Session } from '~domain/session/session';
import { type Result, err, ok } from '~domain/shared/result';
import { DateOnly } from '~domain/values/date-only';
import { Rpe } from '~domain/values/rpe';

/**
 * A set as the athlete entered it - see `MeasurementValues` for the units. A
 * set has no count of sets or rest of its own; those are a target's.
 */
export type SetInput = Omit<MeasurementInput, 'sets' | 'restSeconds'> & {
  notes?: string | null;
  /**
   * 1 to 10, in half-point steps.
   */
  rpe?: number | null;
};

export type LoggedSetView = SetInput & {
  id: string;
  exerciseId: string;
  exerciseName: string;
  setNumber: number;
  /**
   * Already formatted in the athlete's units, RPE included.
   */
  summary: string;
  notes: string | null;
};

export type RecentSetView = {
  /**
   * `YYYY-MM-DD` the set was logged on.
   */
  date: string;
  /**
   * Already formatted in the athlete's units.
   */
  summary: string;
};

/**
 * The prefill for a log form: the same shape it posts back, plus when it was
 * logged - "last time" is only worth showing alongside a date. Notes and RPE
 * are set-specific commentary, not something worth carrying over from a
 * previous day, so they stay unset here even though `SetInput` allows them.
 */
export type LastSetView = SetInput & {
  /**
   * `YYYY-MM-DD` the set was logged on.
   */
  date: string;
  /**
   * Already formatted in the athlete's units.
   */
  summary: string;
};

/**
 * A logged set's measurements, converted into the athlete's own units - the shape a form field's `defaultValue` wants.
 */
function toSetInput(set: LoggedSet, preferences: AthletePreferences): SetInput {
  const { reps, weight, durationMinutes, speed, resistance } = toValues(
    { reps: set.reps, weight: set.weight, duration: set.duration, speed: set.speed, resistance: set.resistanceLevel },
    preferences,
  );
  return { reps, weight, durationMinutes, speed, resistance };
}

export class SessionService {
  constructor(
    private readonly sessions: SessionsRepository,
    private readonly exercises: ExercisesRepository,
    private readonly references: ReferenceDirectory,
    private readonly schedule: DaySchedule,
    private readonly unitOfWork: UnitOfWork,
    private readonly deps: DomainDeps,
  ) {
    this.calendar = new AthleteCalendar(deps.clock);
  }

  private readonly calendar: AthleteCalendar;

  async loggedSetsFor(athlete: Athlete, date: DateOnly): Promise<LoggedSetView[]> {
    const session = await this.sessions.findForDate(athlete.id, date);
    if (!session) return [];

    const references = await this.references.historical({ exerciseIds: session.sets.map((set) => set.exerciseId) });

    return session.sets.map((set) => ({
      id: set.id,
      exerciseId: set.exerciseId,
      exerciseName: references.exercise(set.exerciseId).name,
      setNumber: set.setNumber,
      summary: set.format(athlete.preferences),
      notes: set.notes,
      ...toSetInput(set, athlete.preferences),
    }));
  }

  /**
   * The last few times this exercise was logged, newest first - what a "how
   * did I do last time" prompt shows while today's fields are still blank.
   */
  async recentSetsFor(athlete: Athlete, exerciseId: string, limit: number): Promise<RecentSetView[]> {
    const entries = await this.sessions.recentSetsForExercise(athlete.id, exerciseId, limit);
    return entries.map(({ date, set }) => ({
      date: date.value,
      summary: set.format(athlete.preferences),
    }));
  }

  /**
   * The most recent set logged against every exercise the athlete has ever
   * trained, keyed by exercise id and excluding `date` itself - the log
   * form's prefill once nothing has been logged for that exercise today.
   */
  async lastSetsFor(athlete: Athlete, date: DateOnly): Promise<Record<string, LastSetView>> {
    const entries = await this.sessions.lastSetPerExercise(athlete.id, date);
    const result: Record<string, LastSetView> = {};
    for (const [exerciseId, { date: loggedDate, set }] of entries) {
      result[exerciseId] = {
        date: loggedDate.value,
        summary: set.format(athlete.preferences),
        ...toSetInput(set, athlete.preferences),
      };
    }
    return result;
  }

  /**
   * Records a set against `submitted` - or against today, if that is later
   * (see `AthleteCalendar.loggingDay`) - opening that day's session if this
   * is the first thing logged on it.
   *
   * The session snapshots what the plan said the day was at the moment it
   * opens, which is why the schedule is read here, in the same transaction,
   * rather than derived later - a plan edited next week must not rewrite what
   * today claimed to be.
   *
   * Reports the day it logged against and whether it had to open that day's
   * session, so the caller can log that; the service itself stays free of
   * request-scoped logging.
   */
  async logSet(
    athlete: Athlete,
    submitted: DateOnly,
    exerciseId: string,
    input: SetInput,
  ): Promise<Result<{ date: DateOnly; sessionOpened: boolean }, 'exercise-not-found'>> {
    const exercise = await this.exercises.findVisible(athlete.id, exerciseId);
    if (!exercise) return err('exercise-not-found' as const);

    const date = this.calendar.loggingDay(athlete, submitted);

    return this.unitOfWork.run(async () => {
      const existing = await this.sessions.findForDate(athlete.id, date);
      const session =
        existing ??
        (await this.sessions.add(
          Session.open(athlete.id, date, sessionPlanOf(await this.schedule.on(athlete, date)), this.deps),
        ));

      const { reps, weight, duration, speed, resistance } = toCanonical(input, athlete.preferences);
      session.logSet(
        exerciseId,
        { reps, weight, duration, speed, resistance, notes: input.notes, rpe: input.rpe != null ? Rpe.of(input.rpe) : null },
        this.deps,
      );

      await this.sessions.save(session);
      return ok({ date, sessionOpened: existing === null });
    });
  }

  /**
   * Takes a set back off a day. Scoped by athlete and date, so a set id from
   * someone else's session simply isn't found.
   */
  async removeSet(athlete: Athlete, date: DateOnly, setId: string): Promise<Result<void, 'not-found'>> {
    return this.unitOfWork.run(async () => {
      const session = await this.sessions.findForDate(athlete.id, date);
      if (!session) return err('not-found' as const);

      if (!session.removeSet(setId, this.deps.clock.now())) {
        return err('not-found' as const);
      }

      await this.sessions.save(session);
      return ok();
    });
  }
}
