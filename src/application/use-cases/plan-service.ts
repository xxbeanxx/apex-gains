import type { Athlete } from '~domain/athlete/athlete';
import { activatePlan } from '~domain/plan/activation';
import { Plan } from '~domain/plan/plan';
import type { MoveDirection } from '~domain/shared/ordered';
import { err, ok, type Result } from '~domain/shared/result';
import { DateOnly } from '~domain/values/date-only';
import type { PlansRepository } from '~application/ports/persistence/plans-repository';
import type { WorkoutsRepository } from '~application/ports/persistence/workouts-repository';
import type { UnitOfWork } from '~application/ports/persistence/unit-of-work';

import type { DomainDeps } from '~application/ports/domain-deps';
import { nextCopyName } from '~application/shared/duplicate-name';
import { ForkableLibrary, type ForkMutation } from '~application/shared/fork';

export type PlanSummary = {
  id: string;
  name: string;
  isActive: boolean;
  anchorDate: string;
  slotCount: number;
  isSample: boolean;
  /** Non-null once the athlete has minted a share link for this plan. */
  shareToken: string | null;
  /** A personal copy of a sample - shown as "Customized" rather than "Sample". */
  isCustomized: boolean;
};

export type PlanSlotView = {
  id: string;
  position: number;
  workoutId: string | null;
  workoutName: string | null;
  isRestDay: boolean;
  /** The next calendar date this slot comes up, as YYYY-MM-DD - today itself if it's already due. */
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
    private readonly workouts: WorkoutsRepository,
    private readonly unitOfWork: UnitOfWork,
    private readonly deps: DomainDeps,
  ) {
    this.editor = new ForkableLibrary(this.plans, this.unitOfWork, this.deps, (plan) => plan.slots);
  }

  /** Load, fork if needed, apply, save - see `shared/fork.server.ts`. */
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
    if (!plan) return null;

    const names = await this.workoutNames(athlete);
    const today = DateOnly.today(this.deps.clock.now(), athlete.preferences.timezone);

    return {
      ...toSummary(plan),
      canRevert: plan.canRevert,
      isDeletable: plan.isDeletable,
      slots: plan.slots.map((slot) => ({
        id: slot.id,
        position: slot.position,
        workoutId: slot.workoutId,
        workoutName: slot.workoutId ? (names.get(slot.workoutId) ?? 'Unknown') : null,
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
   * A personal, editable copy of any plan the athlete can see - their own,
   * or a sample. Built on `copyForImport`, the same deep copy a shared
   * link's import uses, with the source's own workout ids passed straight
   * through rather than resolved through another athlete's library - unlike
   * an import, this athlete already has access to everything the source
   * schedules. The copy keeps the source's anchor date and starts inactive
   * and unshared, same as an import.
   *
   * Deliberately not a fork: duplicating a sample gives a plain row with
   * `forkedFromId` null - no revert, and no effect on whether the sample
   * still appears in the athlete's list. That is a different action from
   * *editing* a sample, which forks it; the two sit side by side in the
   * list's row menu.
   */
  async duplicate(athlete: Athlete, planId: string): Promise<Result<{ id: string }, 'not-found'>> {
    return this.unitOfWork.run(async () => {
      const source = await this.plans.findVisible(athlete.id, planId);
      if (!source) return err('not-found' as const);

      const names = await this.plans.listNamesFor(athlete.id, athlete.preferences.showSampleData);
      const name = nextCopyName(source.name, new Set(names.map((found) => found.name)));

      const copy = source.copyForImport(athlete.id, source.anchorDate, (workoutId) => workoutId, this.deps);
      copy.rename(name, this.deps.clock.now());

      await this.plans.save(copy);
      return ok({ id: copy.id });
    });
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

  /** Revokes the link. The token is dropped, never reissued. */
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

  /** See `ForkableLibrary.revert` - the caller redirects to the original. */
  async revert(athlete: Athlete, planId: string): Promise<Result<{ forkedFromId: string }, 'not-found' | 'nothing-to-revert'>> {
    return this.editor.revert(athlete.id, planId);
  }

  private async workoutNames(athlete: Athlete): Promise<Map<string, string>> {
    const workouts = await this.workouts.listNamesFor(athlete.id, athlete.preferences.showSampleData);
    return new Map(workouts.map((workout) => [workout.id, workout.name]));
  }
}
