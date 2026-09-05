import { Inject, Injectable } from '@nestjs/common';

import type { Athlete } from '~/domain/athlete/athlete';
import { cardioFieldsFor, type CardioFields } from '~/domain/equipment/cardio-fields';
import type { ExerciseType } from '~/domain/exercise/exercise-type';
import type { SessionPlan } from '~/domain/session/session';
import { DateOnly } from '~/domain/values/date-only';
import type { EquipmentRepository } from '~/repositories/equipment-repository.server';
import type { ExercisesRepository } from '~/repositories/exercises-repository.server';
import type { PlansRepository } from '~/repositories/plans-repository.server';
import type { WorkoutsRepository } from '~/repositories/workouts-repository.server';
import type { SessionsRepository } from '~/repositories/sessions-repository.server';
import { ExerciseDirectory } from './shared/exercise-directory.server';

import {
  EQUIPMENT_REPOSITORY,
  EXERCISES_REPOSITORY,
  PLANS_REPOSITORY,
  WORKOUTS_REPOSITORY,
  SESSIONS_REPOSITORY,
} from '~/repositories/tokens';

export type PlanItem = {
  exerciseId: string;
  exerciseName: string;
  exerciseType: ExerciseType;
  /** Which cardio measurements the log form should offer - see `cardioFieldsFor`. */
  cardioFields: CardioFields;
  /** Already formatted in the athlete's units. */
  targetSummary: string | null;
  /** Drives the "n of m sets" progress bar; null when nothing was targeted. */
  targetSets: number | null;
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
@Injectable()
export class TrainingPlanService {
  constructor(
    @Inject(PLANS_REPOSITORY) private readonly plans: PlansRepository,
    @Inject(WORKOUTS_REPOSITORY) private readonly workouts: WorkoutsRepository,
    @Inject(EXERCISES_REPOSITORY) private readonly exercises: ExercisesRepository,
    @Inject(EQUIPMENT_REPOSITORY) private readonly equipment: EquipmentRepository,
    @Inject(SESSIONS_REPOSITORY)
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
        targetSummary: entry.target.format(athlete.preferences),
        targetSets: entry.target.sets,
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
