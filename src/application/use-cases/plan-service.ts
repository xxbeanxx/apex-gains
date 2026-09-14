import type { DomainDeps } from '~application/ports/domain-deps';
import type { PlansRepository } from '~application/ports/persistence/plans-repository';
import type { UnitOfWork } from '~application/ports/persistence/unit-of-work';
import type { AthleteCalendar } from '~application/shared/athlete-calendar';
import { type ForkMutation, ForkableLibrary } from '~application/shared/fork';
import type { ReferenceDirectory } from '~application/shared/reference-directory';
import type { Athlete } from '~domain/athlete/athlete';
import { activatePlan } from '~domain/plan/activation';
import { Plan } from '~domain/plan/plan';
import type { MoveDirection } from '~domain/shared/ordered';
import { type Result, err, ok } from '~domain/shared/result';
import { DateOnly } from '~domain/values/date-only';

export type PlanSummary = {
  id: string;
  name: string;
  isActive: boolean;
  anchorDate: string;
  slotCount: number;
  isSample: boolean;
  /**
   * Non-null once the athlete has minted a share link for this plan.
   */
  shareToken: string | null;
  /**
   * A personal copy of a sample - shown as "Customized" rather than "Sample".
   */
  isCustomized: boolean;
};

export type PlanSlotView = {
  id: string;
  position: number;
  /**
   * The workout the slot trains - the athlete's fork, when it names a sample
   * they have customized.
   */
  workoutId: string | null;
  workoutName: string | null;
  isRestDay: boolean;
  /**
   * The next calendar date this slot comes up, as YYYY-MM-DD - today itself if it's already due.
   */
  nextDate: string;
};

export type PlanDetail = PlanSummary & {
  canRevert: boolean;
  isDeletable: boolean;
  slots: PlanSlotView[];
};

export type PlanMutation = ForkMutation;

function toSummary(plan: Plan): PlanSummary {
  return {
    id: plan.id,
    name: plan.name,
    isActive: plan.isActive,
    anchorDate: plan.anchorDate.value,
    slotCount: plan.cycleLength,
    isSample: plan.ownership.isSample,
    shareToken: plan.shareToken,
    isCustomized: plan.canRevert,
  };
}

/**
 * Use cases for building and scheduling plans.
 *
 * The service orchestrates - load, hand off to the aggregate, save - and
 * owns none of the rules itself. Reordering, appending, forking and
 * activation all belong to `Plan` and to domain/plan/activation.ts;
 * what lives here is the sequencing that needs a repository or a
 * transaction.
 */
export class PlanService {
  constructor(
    private readonly plans: PlansRepository,
    private readonly references: ReferenceDirectory,
    private readonly unitOfWork: UnitOfWork,
    private readonly deps: DomainDeps,
    private readonly calendar: AthleteCalendar,
  ) {
    this.editor = new ForkableLibrary(this.plans, this.unitOfWork, this.deps, (plan) => plan.slots);
  }

  /**
   * Load, fork if needed, apply, save - see `shared/fork.ts`.
   */
  private readonly editor: ForkableLibrary<Plan>;

  async list(athlete: Athlete): Promise<PlanSummary[]> {
    const plans = await this.plans.listFor(athlete.id, athlete.preferences.showSampleData);
    return plans.map(toSummary);
  }

  /**
   * A plan plus the names of the workouts its slots point at.
   *
   * A slot holds a workout id, not a workout - they are separate
   * aggregates - so the name is joined in here for display rather than being
   * carried around inside the plan.
   */
  async detail(athlete: Athlete, planId: string): Promise<PlanDetail | null> {
    const plan = await this.plans.findVisible(athlete.id, planId);

    if (!plan) {
      return null;
    }

    const workouts = await this.references.forwardLooking(athlete.id, {
      workoutIds: plan.slots.flatMap((slot) => (slot.workoutId ? [slot.workoutId] : [])),
    });
    const today = this.calendar.today(athlete);

    return {
      ...toSummary(plan),
      canRevert: plan.canRevert,
      isDeletable: plan.isDeletable,
      slots: plan.slots.map((slot) => ({
        id: slot.id,
        position: slot.position,
        workoutId: slot.workoutId ? (workouts.workout(slot.workoutId)?.id ?? slot.workoutId) : null,
        workoutName: slot.workoutId ? workouts.workoutName(slot.workoutId) : null,
        isRestDay: slot.isRestDay,
        nextDate: plan.nextDateFor(slot, today).value,
      })),
    };
  }

  async create(athlete: Athlete, name: string, anchorDate: DateOnly): Promise<PlanSummary> {
    const plan = Plan.create(athlete.id, name, anchorDate, this.deps);
    await this.unitOfWork.run(() => this.plans.save(plan));
    return toSummary(plan);
  }

  /**
   * A plain personal copy named "<name> (copy)" - see `ForkableLibrary.duplicate`.
   */
  async duplicate(athlete: Athlete, planId: string): Promise<Result<{ id: string }, 'not-found'>> {
    return this.editor.duplicate(athlete.id, athlete.preferences.showSampleData, planId, (source) =>
      source.copyForImport(athlete.id, source.anchorDate, (workoutId) => workoutId, this.deps),
    );
  }

  async rename(athlete: Athlete, planId: string, name: string): Promise<PlanMutation> {
    return this.editor.mutate(athlete.id, planId, (plan) => plan.rename(name, this.deps.clock.now()));
  }

  async reanchor(athlete: Athlete, planId: string, anchorDate: DateOnly): Promise<PlanMutation> {
    return this.editor.mutate(athlete.id, planId, (plan) => plan.reanchor(anchorDate, this.deps.clock.now()));
  }

  /**
   * Makes this the athlete's active plan, standing down whatever was
   * active before. Both plans are saved in the same transaction, because
   * a partial unique index refuses two active rows for one athlete - so the
   * intermediate state must never be committed.
   */
  async activate(athlete: Athlete, planId: string): Promise<PlanMutation> {
    return this.editor.edit(athlete.id, planId, async (copy) => {
      const currentlyActive = await this.plans.findActive(athlete.id);

      for (const plan of activatePlan(copy.editable, currentlyActive, this.deps.clock.now())) {
        await this.plans.save(plan);
      }
      return ok();
    });
  }

  async deactivate(athlete: Athlete, planId: string): Promise<PlanMutation> {
    return this.editor.mutate(athlete.id, planId, (plan) => plan.deactivate(this.deps.clock.now()));
  }

  /**
   * Mints - or hands back - the token a share link and QR code carry.
   *
   * Goes through the same editor as every other mutation, so sharing a
   * sample forks it first: a token names one row, and a sample belongs to
   * everyone. The caller has to follow `forkedId`, because the token it gets
   * back belongs to the fork, not to the sample it was asked about.
   */
  async share(athlete: Athlete, planId: string): Promise<Result<{ forkedId: string | null; token: string }, 'not-found'>> {
    let token = '';
    const outcome: PlanMutation = await this.editor.edit(athlete.id, planId, async (copy) => {
      token = copy.editable.share(this.deps);
      await this.plans.save(copy.editable);
      return ok<void>(undefined);
    });

    return outcome.ok ? ok({ forkedId: outcome.value.forkedId, token }) : err(outcome.error);
  }

  /**
   * Revokes the link. The token is dropped, never reissued.
   */
  async unshare(athlete: Athlete, planId: string): Promise<PlanMutation> {
    return this.editor.mutate(athlete.id, planId, (plan) => plan.unshare(this.deps.clock.now()));
  }

  async addSlot(athlete: Athlete, planId: string, workoutId: string | null): Promise<PlanMutation> {
    return this.editor.mutate(athlete.id, planId, (plan) => plan.addSlot(workoutId, this.deps));
  }

  async removeSlot(athlete: Athlete, planId: string, slotId: string): Promise<PlanMutation> {
    return this.editor.mutate(athlete.id, planId, (plan, translate) =>
      plan.removeSlot(translate(slotId), this.deps.clock.now()),
    );
  }

  async moveSlot(athlete: Athlete, planId: string, slotId: string, direction: MoveDirection): Promise<PlanMutation> {
    return this.editor.mutate(athlete.id, planId, (plan, translate) =>
      plan.moveSlot(translate(slotId), direction, this.deps.clock.now()),
    );
  }

  async remove(athlete: Athlete, planId: string): Promise<Result<void, 'not-found' | 'sample'>> {
    return this.editor.remove(athlete.id, planId);
  }

  /**
   * See `ForkableLibrary.revert` - the caller redirects to the original.
   */
  async revert(athlete: Athlete, planId: string): Promise<Result<{ forkedFromId: string }, 'not-found' | 'nothing-to-revert'>> {
    return this.editor.revert(athlete.id, planId);
  }
}
