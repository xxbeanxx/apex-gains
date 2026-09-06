import { Inject, Injectable } from '@nestjs/common';

import type { Athlete } from '~/domain/athlete/athlete';
import type { AthletePreferences } from '~/domain/athlete/preferences';
import type { LoggedSet } from '~/domain/session/logged-set';
import { Session } from '~/domain/session/session';
import { err, ok, type Result } from '~/domain/shared/result';
import { DateOnly } from '~/domain/values/date-only';
import { Duration } from '~/domain/values/duration';
import { Rpe } from '~/domain/values/rpe';
import { Speed } from '~/domain/values/speed';
import { Weight } from '~/domain/values/weight';
import type { ExercisesRepository } from '~/repositories/exercises-repository.server';
import type { UnitOfWork } from '~/repositories/unit-of-work.server';
import type { SessionsRepository } from '~/repositories/sessions-repository.server';
import { EXERCISES_REPOSITORY, UNIT_OF_WORK, SESSIONS_REPOSITORY } from '~/repositories/tokens';
import { DOMAIN_DEPS } from '~/services/shared/tokens';

import type { DomainDeps } from './shared/deps.server';
import { ExerciseDirectory } from './shared/exercise-directory.server';
import { TrainingPlanService } from './training-plan-service.server';

/** A set as the athlete entered it: their weight unit, their speed unit, minutes. */
export type SetInput = {
  reps?: number | null;
  weight?: number | null;
  durationMinutes?: number | null;
  speed?: number | null;
  resistance?: number | null;
  notes?: string | null;
  /** 1 to 10, in half-point steps. */
  rpe?: number | null;
};

export type LoggedSetView = SetInput & {
  id: string;
  exerciseId: string;
  exerciseName: string;
  setNumber: number;
  /** Already formatted in the athlete's units, RPE included. */
  summary: string;
  notes: string | null;
};

export type RecentSetView = {
  /** `YYYY-MM-DD` the set was logged on. */
  date: string;
  /** Already formatted in the athlete's units. */
  summary: string;
};

/**
 * The prefill for a log form: the same shape it posts back, plus when it was
 * logged - "last time" is only worth showing alongside a date. Notes and RPE
 * are set-specific commentary, not something worth carrying over from a
 * previous day, so they stay unset here even though `SetInput` allows them.
 */
export type LastSetView = SetInput & {
  /** `YYYY-MM-DD` the set was logged on. */
  date: string;
  /** Already formatted in the athlete's units. */
  summary: string;
};

/** A logged set's measurements, converted into the athlete's own units - the shape a form field's `defaultValue` wants. */
function toSetInput(set: LoggedSet, preferences: AthletePreferences): SetInput {
  return {
    reps: set.reps,
    weight: set.weight ? preferences.weightValue(set.weight) : null,
    durationMinutes: set.duration ? set.duration.inMinutes : null,
    speed: set.speed ? preferences.speedValue(set.speed) : null,
    resistance: set.resistanceLevel,
  };
}

@Injectable()
export class SessionService {
  constructor(
    @Inject(SESSIONS_REPOSITORY)
    private readonly sessions: SessionsRepository,
    @Inject(EXERCISES_REPOSITORY) private readonly exercises: ExercisesRepository,
    @Inject(TrainingPlanService) private readonly plans: TrainingPlanService,
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: UnitOfWork,
    @Inject(DOMAIN_DEPS) private readonly deps: DomainDeps,
  ) {}

  async loggedSetsFor(athlete: Athlete, date: DateOnly): Promise<LoggedSetView[]> {
    const session = await this.sessions.findForDate(athlete.id, date);
    if (!session) return [];

    const directory = await ExerciseDirectory.of(
      session.sets.map((set) => set.exerciseId),
      this.exercises,
    );

    return session.sets.map((set) => ({
      id: set.id,
      exerciseId: set.exerciseId,
      exerciseName: directory.nameOf(set.exerciseId),
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
   * Records a set against `date`, opening that day's session if this is the
   * first thing logged on it.
   *
   * The session snapshots what the plan said the day was at the moment it
   * opens, which is why the plan is read here rather than derived later - a
   * plan edited next week must not rewrite what today claimed to be.
   *
   * Reports whether it had to open the session so the caller can log that;
   * the service itself stays free of request-scoped logging.
   */
  async logSet(
    athlete: Athlete,
    date: DateOnly,
    exerciseId: string,
    input: SetInput,
  ): Promise<Result<{ sessionOpened: boolean }, 'exercise-not-found'>> {
    const exercise = await this.exercises.findVisible(athlete.id, exerciseId);
    if (!exercise) return err('exercise-not-found' as const);

    const plan = await this.plans.planFor(athlete, date);

    return this.unitOfWork.run(async () => {
      const existing = await this.sessions.findForDate(athlete.id, date);
      const session =
        existing ??
        (await this.sessions.add(Session.open(athlete.id, date, TrainingPlanService.sessionPlanFrom(plan), this.deps)));

      const { weightUnit, distanceUnit } = athlete.preferences;
      session.logSet(
        exerciseId,
        {
          reps: input.reps,
          weight: input.weight != null ? Weight.in(weightUnit, input.weight) : null,
          duration: input.durationMinutes != null ? Duration.minutes(input.durationMinutes) : null,
          speed: input.speed != null ? Speed.in(distanceUnit, input.speed) : null,
          resistance: input.resistance,
          notes: input.notes,
          rpe: input.rpe != null ? Rpe.of(input.rpe) : null,
        },
        this.deps,
      );

      await this.sessions.save(session);
      return ok({ sessionOpened: existing === null });
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
