import type { PlansRepository } from '~application/ports/persistence/plans-repository';
import type { ReferenceDirectory } from '~application/shared/reference-directory';
import type { Athlete } from '~domain/athlete/athlete';
import type { Plan } from '~domain/plan/plan';
import type { SessionPlan } from '~domain/session/session';
import type { DateOnly } from '~domain/values/date-only';
import type { Workout } from '~domain/workout/workout';

/**
 * What an athlete's active plan says one calendar day is - a scheduled day
 * (see CONTEXT.md).
 *
 * "none" covers both having no active plan and having one with no slots -
 * from the athlete's point of view there is nothing scheduled either way.
 */
export type ScheduledDay =
  | { readonly type: 'none' }
  | { readonly type: 'rest'; readonly planId: string }
  | {
      readonly type: 'workout';
      readonly planId: string;
      /**
       * The workout the athlete trains - their fork, when the slot names a
       * sample they have customized.
       */
      readonly workout: Workout;
    };

/**
 * The one reading of the active plan's cycle, for every caller that needs
 * to know what a date is: the day's display, the week ahead, and the
 * snapshot a session takes when it opens.
 *
 * `Plan.slotOn` says which slot a date falls on; this adds what that slot
 * means to the athlete. A slot names a workout as a forward-looking
 * reference, so it resolves to their fork when they have one. A slot whose
 * workout resolves to nothing reads as rest, the same as the null slot a
 * deleted workout leaves behind - the schema makes that unreachable by id,
 * so it only guards against broken data, but a day and the week ahead must
 * never disagree about it.
 */
export class DaySchedule {
  constructor(
    private readonly plans: PlansRepository,
    private readonly references: ReferenceDirectory,
  ) {}

  async on(athlete: Athlete, date: DateOnly): Promise<ScheduledDay> {
    const [day] = await this.across(athlete, [date]);
    return day!;
  }

  /**
   * Each of `dates`, in order, from one read of the plan and one lookup of
   * the workouts its slots name.
   */
  async across(athlete: Athlete, dates: readonly DateOnly[]): Promise<ScheduledDay[]> {
    const plan = await this.plans.findActive(athlete.id);

    if (!plan) {
      return dates.map(() => ({ type: 'none' }));
    }

    const workoutIds = [...new Set(dates.flatMap((date) => workoutIdOn(plan, date) ?? []))];
    const workouts = await this.references.forwardLooking(athlete.id, { workoutIds: workoutIds });

    return dates.map((date): ScheduledDay => {
      const slot = plan.slotOn(date);

      if (!slot) {
        return { type: 'none' };
      }

      const workout = slot.workoutId === null ? null : workouts.workout(slot.workoutId);
      return workout ? { type: 'workout', planId: plan.id, workout: workout } : { type: 'rest', planId: plan.id };
    });
  }
}

/**
 * What a session opened on a scheduled day records about it.
 */
export function sessionPlanOf(day: ScheduledDay): SessionPlan {
  return {
    planId: day.type === 'none' ? null : day.planId,
    workoutId: day.type === 'workout' ? day.workout.id : null,
    isRestDay: day.type === 'rest',
  };
}

function workoutIdOn(plan: Plan, date: DateOnly): string | null {
  return plan.slotOn(date)?.workoutId ?? null;
}
