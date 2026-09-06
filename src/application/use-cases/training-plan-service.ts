import type { EquipmentRepository } from '~application/ports/persistence/equipment-repository';
import type { ExercisesRepository } from '~application/ports/persistence/exercises-repository';
import type { PlansRepository } from '~application/ports/persistence/plans-repository';
import type { SessionsRepository } from '~application/ports/persistence/sessions-repository';
import type { WorkoutsRepository } from '~application/ports/persistence/workouts-repository';
import { ExerciseDirectory } from '~application/shared/exercise-directory';
import { type TargetView, toTargetView } from '~application/shared/target-view';
import type { Athlete } from '~domain/athlete/athlete';
import { type CardioFields, cardioFieldsFor } from '~domain/equipment/cardio-fields';
import type { ExerciseType } from '~domain/exercise/exercise-type';
import type { SessionPlan } from '~domain/session/session';
import { DateOnly } from '~domain/values/date-only';

export type PlanItem = {
  exerciseId: string;
  exerciseName: string;
  exerciseType: ExerciseType;
  /** Which cardio measurements the log form should offer - see `cardioFieldsFor`. */
  cardioFields: CardioFields;
  /** Null when the exercise carries no target at all. */
  target: TargetView | null;
};

/**
 * What the active plan says a given day is.
 *
 * "none" covers both having no active plan and having one with no slots -
 * from the athlete's point of view the app has nothing to suggest either way.
 */
export type DayPlan =
  | { type: 'none' }
  | { type: 'rest'; planId: string }
  | {
      type: 'workout';
      planId: string;
      workoutId: string;
      workoutName: string;
      items: PlanItem[];
    };

export type WeekPlanDay =
  { date: string; type: 'none' } | { date: string; type: 'rest' } | { date: string; type: 'workout'; workoutName: string };

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
 * the shapes the pages render, and mutates nothing. The rule it leans on,
 * "which slot does this date fall on", belongs to `Plan.slotOn`.
 */
export class TrainingPlanService {
  constructor(
    private readonly plans: PlansRepository,
    private readonly workouts: WorkoutsRepository,
    private readonly exercises: ExercisesRepository,
    private readonly equipment: EquipmentRepository,
    private readonly sessions: SessionsRepository,
  ) {}

  async planFor(athlete: Athlete, date: DateOnly): Promise<DayPlan> {
    const plan = await this.plans.findActive(athlete.id);
    if (!plan) return { type: 'none' };

    const slot = plan.slotOn(date);
    if (!slot) return { type: 'none' };
    if (slot.isRestDay || !slot.workoutId) {
      return { type: 'rest', planId: plan.id };
    }

    const workout = await this.workouts.findVisible(athlete.id, slot.workoutId);
    // The slot points at a workout the athlete can no longer see (deleted,
    // or hidden with sample data). Nothing to train, so the day reads as
    // rest rather than as an error.
    if (!workout) return { type: 'rest', planId: plan.id };

    const directory = await ExerciseDirectory.of(
      workout.exercises.map((entry) => entry.exerciseId),
      this.exercises,
    );
    const equipment = await this.equipment.findManyByIds(directory.allEquipmentIds);
    const cardioKindById = new Map(equipment.map((item) => [item.id, item.cardioKind]));

    return {
      type: 'workout',
      planId: plan.id,
      workoutId: workout.id,
      workoutName: workout.name,
      items: workout.exercises.map((entry) => ({
        exerciseId: entry.exerciseId,
        exerciseName: directory.nameOf(entry.exerciseId),
        exerciseType: directory.typeOf(entry.exerciseId),
        cardioFields: cardioFieldsFor(directory.equipmentIdsOf(entry.exerciseId).map((id) => cardioKindById.get(id) ?? null)),
        target: toTargetView(entry.target, athlete.preferences),
      })),
    };
  }

  /** What a session opened on `date` should record about the day's plan. */
  static sessionPlanFrom(plan: DayPlan): SessionPlan {
    return {
      planId: plan.type === 'none' ? null : plan.planId,
      workoutId: plan.type === 'workout' ? plan.workoutId : null,
      isRestDay: plan.type === 'rest',
    };
  }

  /** The next seven days according to the active plan's cycle. */
  async upcomingWeek(athlete: Athlete, from: DateOnly): Promise<WeekPlanDay[]> {
    const dates = from.range(WEEK);
    const plan = await this.plans.findActive(athlete.id);
    if (!plan || plan.cycleLength === 0) {
      return dates.map((date) => ({ date: date.value, type: 'none' }));
    }

    const workouts = await this.workouts.listNamesFor(athlete.id, athlete.preferences.showSampleData);
    const names = new Map(workouts.map((t) => [t.id, t.name]));

    return dates.map((date) => {
      const slot = plan.slotOn(date);
      if (!slot || slot.isRestDay || !slot.workoutId) {
        return { date: date.value, type: 'rest' as const };
      }
      return {
        date: date.value,
        type: 'workout' as const,
        workoutName: names.get(slot.workoutId) ?? 'Unknown',
      };
    });
  }

  /** The seven days before `throughExclusive`, from what was actually logged. */
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
