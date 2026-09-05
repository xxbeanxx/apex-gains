import { Inject, Injectable } from '@nestjs/common';

import type { Athlete } from '~/domain/athlete/athlete';
import { WorkoutSession } from '~/domain/session/workout-session';
import { err, ok, type Result } from '~/domain/shared/result';
import { DateOnly } from '~/domain/values/date-only';
import { Duration } from '~/domain/values/duration';
import { Speed } from '~/domain/values/speed';
import { Weight } from '~/domain/values/weight';
import type { ExercisesRepository } from '~/repositories/exercises-repository.server';
import type { UnitOfWork } from '~/repositories/unit-of-work.server';
import type { WorkoutSessionsRepository } from '~/repositories/workout-sessions-repository.server';
import { EXERCISES_REPOSITORY, UNIT_OF_WORK, WORKOUT_SESSIONS_REPOSITORY } from '~/repositories/tokens';
import { DOMAIN_DEPS } from '~/services/shared/tokens';

import type { DomainDeps } from './shared/deps.server';
import { ExerciseDirectory } from './shared/exercise-directory.server';
import { TrainingPlanService } from './training-plan-service.server';

export type LoggedSetView = {
  id: string;
  exerciseId: string;
  exerciseName: string;
  setNumber: number;
  /** Already formatted in the athlete's units. */
  summary: string;
};

export type RecentSetView = {
  /** `YYYY-MM-DD` the set was logged on. */
  date: string;
  /** Already formatted in the athlete's units. */
  summary: string;
};

/** A set as the athlete entered it: their weight unit, their speed unit, minutes. */
export type SetInput = {
  reps?: number | null;
  weight?: number | null;
  durationMinutes?: number | null;
  speed?: number | null;
  resistance?: number | null;
};

@Injectable()
export class WorkoutLogService {
  constructor(
    @Inject(WORKOUT_SESSIONS_REPOSITORY)
    private readonly sessions: WorkoutSessionsRepository,
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
   * Records a set against `date`, opening that day's session if this is the
   * first thing logged on it.
   *
   * The session snapshots what the routine said the day was at the moment it
   * opens, which is why the plan is read here rather than derived later - a
   * routine edited next week must not rewrite what today claimed to be.
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
        (await this.sessions.add(WorkoutSession.open(athlete.id, date, TrainingPlanService.sessionPlanFrom(plan), this.deps)));

      const { weightUnit, distanceUnit } = athlete.preferences;
      session.logSet(
        exerciseId,
        {
          reps: input.reps,
          weight: input.weight != null ? Weight.in(weightUnit, input.weight) : null,
          duration: input.durationMinutes != null ? Duration.minutes(input.durationMinutes) : null,
          speed: input.speed != null ? Speed.in(distanceUnit, input.speed) : null,
          resistance: input.resistance,
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
