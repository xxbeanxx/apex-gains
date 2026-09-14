import type { SessionsRepository } from '~application/ports/persistence/sessions-repository';
import type { DaySchedule } from '~application/shared/day-schedule';
import type { ReferenceDirectory } from '~application/shared/reference-directory';
import { type TargetView, toTargetView } from '~application/shared/target-view';
import type { Athlete } from '~domain/athlete/athlete';
import type { CardioFields } from '~domain/equipment/cardio-fields';
import type { ExerciseType } from '~domain/exercise/exercise-type';
import { DateOnly } from '~domain/values/date-only';

export type PlanItem = {
  /**
   * The exercise the athlete trains - their fork, when the workout names a
   * sample they have customized - so it is also the id a logged set records.
   */
  exerciseId: string;
  exerciseName: string;
  exerciseType: ExerciseType;
  /**
   * Which cardio measurements the log form should offer - see `cardioFieldsFor`.
   */
  cardioFields: CardioFields;
  /**
   * Null when the exercise carries no target at all.
   */
  target: TargetView | null;
};

/**
 * A scheduled day (see `ScheduledDay`) as a page renders it.
 */
export type DayPlan =
  | { type: 'none' }
  | { type: 'rest'; planId: string }
  | {
      type: 'workout';
      planId: string;
      /**
       * The workout the athlete trains - their fork, when the slot names a
       * sample they have customized.
       */
      workoutId: string;
      workoutName: string;
      items: PlanItem[];
    };

export type WeekPlanDay =
  | { date: string; type: 'none' }
  | { date: string; type: 'rest' }
  | { date: string; type: 'workout'; workoutName: string };

export type WeekHistoryDay = {
  date: string;
  status: 'workout' | 'rest' | 'none';
  exerciseCount: number;
  setCount: number;
};

const WEEK = 7;

/**
 * Reads the schedule: what to train today, what is coming, what actually
 * happened.
 *
 * Purely a read model - it composes plans, workouts and sessions into
 * the shapes the pages render, and mutates nothing. What a date *is* comes
 * from `DaySchedule`; this only dresses it for display.
 */
export class TrainingPlanService {
  constructor(
    private readonly schedule: DaySchedule,
    private readonly references: ReferenceDirectory,
    private readonly sessions: SessionsRepository,
  ) {}

  async planFor(athlete: Athlete, date: DateOnly): Promise<DayPlan> {
    const day = await this.schedule.on(athlete, date);

    if (day.type !== 'workout') {
      return day;
    }

    const { workout } = day;
    const exercises = await this.references.forwardLooking(athlete.id, {
      exerciseIds: workout.exercises.map((entry) => entry.exerciseId),
    });

    return {
      type: 'workout',
      planId: day.planId,
      workoutId: workout.id,
      workoutName: workout.name,
      items: workout.exercises.map((entry) => {
        const exercise = exercises.exercise(entry.exerciseId);
        return {
          exerciseId: exercise.id,
          exerciseName: exercise.name,
          exerciseType: exercise.exerciseType,
          cardioFields: exercise.cardioFields,
          target: toTargetView(entry.target, athlete.preferences),
        };
      }),
    };
  }

  /**
   * The next seven days according to the active plan's cycle.
   */
  async upcomingWeek(athlete: Athlete, from: DateOnly): Promise<WeekPlanDay[]> {
    const dates = from.range(WEEK);
    const days = await this.schedule.across(athlete, dates);

    return days.map((day, i): WeekPlanDay => {
      const date = dates[i]!.value;
      return day.type === 'workout' ? { date, type: 'workout', workoutName: day.workout.name } : { date, type: day.type };
    });
  }

  /**
   * The seven days before `throughExclusive`, from what was actually logged.
   */
  async pastWeek(athlete: Athlete, throughExclusive: DateOnly): Promise<WeekHistoryDay[]> {
    const start = throughExclusive.minusDays(WEEK);
    const sessions = await this.sessions.listForDateRange(athlete.id, start, throughExclusive);
    const byDate = new Map(sessions.map((session) => [session.date.value, session]));

    return start.range(WEEK).map((date) => {
      const session = byDate.get(date.value);
      if (!session) {
        return {
          date: date.value,
          status: 'none' as const,
          exerciseCount: 0,
          setCount: 0,
        };
      }
      return {
        date: date.value,
        status: session.status,
        exerciseCount: session.exerciseCount,
        setCount: session.setCount,
      };
    });
  }
}
