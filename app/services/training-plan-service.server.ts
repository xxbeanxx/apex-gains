import { Inject, Injectable } from '@nestjs/common';

import type { Athlete } from '~/domain/athlete/athlete';
import type { CardioKind } from '~/domain/equipment/equipment';
import type { ExerciseType } from '~/domain/exercise/exercise-type';
import type { SessionPlan } from '~/domain/session/workout-session';
import { DateOnly } from '~/domain/values/date-only';
import type { EquipmentRepository } from '~/repositories/equipment-repository.server';
import type { ExercisesRepository } from '~/repositories/exercises-repository.server';
import type { RoutinesRepository } from '~/repositories/routines-repository.server';
import type { TemplatesRepository } from '~/repositories/templates-repository.server';
import type { WorkoutSessionsRepository } from '~/repositories/workout-sessions-repository.server';
import {
  EQUIPMENT_REPOSITORY,
  EXERCISES_REPOSITORY,
  ROUTINES_REPOSITORY,
  TEMPLATES_REPOSITORY,
  WORKOUT_SESSIONS_REPOSITORY,
} from '~/repositories/tokens';

export type PlanItem = {
  exerciseId: string;
  exerciseName: string;
  exerciseType: ExerciseType;
  /** `cardioKind` of each linked equipment, for deciding which cardio fields apply - see `cardioFieldsFor`. */
  equipmentCardioKinds: (CardioKind | null)[];
  /** Already formatted in the athlete's units. */
  targetSummary: string | null;
  /** Drives the "n of m sets" progress bar; null when nothing was targeted. */
  targetSets: number | null;
};

/**
 * What the active routine says a given day is.
 *
 * "none" covers both having no active routine and having one with no slots -
 * from the athlete's point of view the app has nothing to suggest either way.
 */
export type DayPlan =
  | { type: 'none' }
  | { type: 'rest'; routineId: string }
  | {
      type: 'template';
      routineId: string;
      templateId: string;
      templateName: string;
      items: PlanItem[];
    };

export type WeekPlanDay =
  { date: string; type: 'none' } | { date: string; type: 'rest' } | { date: string; type: 'template'; templateName: string };

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
 * Purely a read model - it composes routines, templates and sessions into
 * the shapes the pages render, and mutates nothing. The rule it leans on,
 * "which slot does this date fall on", belongs to `Routine.slotOn`.
 */
@Injectable()
export class TrainingPlanService {
  constructor(
    @Inject(ROUTINES_REPOSITORY) private readonly routines: RoutinesRepository,
    @Inject(TEMPLATES_REPOSITORY) private readonly templates: TemplatesRepository,
    @Inject(EXERCISES_REPOSITORY) private readonly exercises: ExercisesRepository,
    @Inject(EQUIPMENT_REPOSITORY) private readonly equipment: EquipmentRepository,
    @Inject(WORKOUT_SESSIONS_REPOSITORY)
    private readonly sessions: WorkoutSessionsRepository,
  ) {}

  async planFor(athlete: Athlete, date: DateOnly): Promise<DayPlan> {
    const routine = await this.routines.findActive(athlete.id);
    if (!routine) return { type: 'none' };

    const slot = routine.slotOn(date);
    if (!slot) return { type: 'none' };
    if (slot.isRestDay || !slot.templateId) {
      return { type: 'rest', routineId: routine.id };
    }

    const template = await this.templates.findVisible(athlete.id, slot.templateId);
    // The slot points at a template the athlete can no longer see (deleted,
    // or hidden with sample data). Nothing to train, so the day reads as
    // rest rather than as an error.
    if (!template) return { type: 'rest', routineId: routine.id };

    const exercises = await this.exercises.findManyByIds(template.exercises.map((entry) => entry.exerciseId));
    const byId = new Map(exercises.map((exercise) => [exercise.id, exercise]));

    const equipmentIds = new Set<string>();
    for (const exercise of exercises) {
      for (const id of exercise.equipmentIds) equipmentIds.add(id);
    }
    const equipment = await this.equipment.findManyByIds([...equipmentIds]);
    const cardioKindById = new Map(equipment.map((item) => [item.id, item.cardioKind]));

    return {
      type: 'template',
      routineId: routine.id,
      templateId: template.id,
      templateName: template.name,
      items: template.exercises.map((entry) => {
        const exercise = byId.get(entry.exerciseId);
        return {
          exerciseId: entry.exerciseId,
          exerciseName: exercise?.name ?? 'Unknown',
          exerciseType: exercise?.exerciseType ?? 'strength',
          equipmentCardioKinds: (exercise?.equipmentIds ?? []).map((id) => cardioKindById.get(id) ?? null),
          targetSummary: entry.target.format(athlete.preferences),
          targetSets: entry.target.sets,
        };
      }),
    };
  }

  /** What a session opened on `date` should record about the day's plan. */
  static sessionPlanFrom(plan: DayPlan): SessionPlan {
    return {
      routineId: plan.type === 'none' ? null : plan.routineId,
      templateId: plan.type === 'template' ? plan.templateId : null,
      isRestDay: plan.type === 'rest',
    };
  }

  /** The next seven days according to the active routine's cycle. */
  async upcomingWeek(athlete: Athlete, from: DateOnly): Promise<WeekPlanDay[]> {
    const dates = from.range(WEEK);
    const routine = await this.routines.findActive(athlete.id);
    if (!routine || routine.cycleLength === 0) {
      return dates.map((date) => ({ date: date.value, type: 'none' }));
    }

    const templates = await this.templates.listNamesFor(athlete.id, athlete.preferences.showSampleData);
    const names = new Map(templates.map((t) => [t.id, t.name]));

    return dates.map((date) => {
      const slot = routine.slotOn(date);
      if (!slot || slot.isRestDay || !slot.templateId) {
        return { date: date.value, type: 'rest' as const };
      }
      return {
        date: date.value,
        type: 'template' as const,
        templateName: names.get(slot.templateId) ?? 'Unknown',
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
