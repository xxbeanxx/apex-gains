import { Inject, Injectable } from '@nestjs/common';

import type { Athlete } from '~/domain/athlete/athlete';
import { activateRoutine } from '~/domain/routine/activation';
import { Routine } from '~/domain/routine/routine';
import type { MoveDirection } from '~/domain/shared/ordered';
import { err, ok, type Result } from '~/domain/shared/result';
import { DateOnly } from '~/domain/values/date-only';
import type { RoutinesRepository } from '~/repositories/routines-repository.server';
import type { TemplatesRepository } from '~/repositories/templates-repository.server';
import type { UnitOfWork } from '~/repositories/unit-of-work.server';
import { ROUTINES_REPOSITORY, TEMPLATES_REPOSITORY, UNIT_OF_WORK } from '~/repositories/tokens';
import { DOMAIN_DEPS } from '~/services/shared/tokens';

import type { DomainDeps } from './shared/deps.server';
import { ForkableLibrary, type ForkMutation } from './shared/fork.server';

export type RoutineSummary = {
  id: string;
  name: string;
  isActive: boolean;
  anchorDate: string;
  slotCount: number;
  isSample: boolean;
  /** Non-null once the athlete has minted a share link for this routine. */
  shareToken: string | null;
  /** A personal copy of a sample - shown as "Customized" rather than "Sample". */
  isCustomized: boolean;
};

export type RoutineSlotView = {
  id: string;
  position: number;
  templateId: string | null;
  templateName: string | null;
  isRestDay: boolean;
};

export type RoutineDetail = RoutineSummary & {
  canRevert: boolean;
  isDeletable: boolean;
  slots: RoutineSlotView[];
};

export type RoutineMutation = ForkMutation;

function toSummary(routine: Routine): RoutineSummary {
  return {
    id: routine.id,
    name: routine.name,
    isActive: routine.isActive,
    anchorDate: routine.anchorDate.value,
    slotCount: routine.cycleLength,
    isSample: routine.ownership.isSample,
    shareToken: routine.shareToken,
    isCustomized: routine.canRevert,
  };
}

/**
 * Use cases for building and scheduling routines.
 *
 * The service orchestrates - load, hand off to the aggregate, save - and
 * owns none of the rules itself. Reordering, appending, forking and
 * activation all belong to `Routine` and to domain/routine/activation.ts;
 * what lives here is the sequencing that needs a repository or a
 * transaction.
 */
@Injectable()
export class RoutineService {
  constructor(
    @Inject(ROUTINES_REPOSITORY) private readonly routines: RoutinesRepository,
    @Inject(TEMPLATES_REPOSITORY) private readonly templates: TemplatesRepository,
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: UnitOfWork,
    @Inject(DOMAIN_DEPS) private readonly deps: DomainDeps,
  ) {
    this.editor = new ForkableLibrary(this.routines, this.unitOfWork, this.deps, (routine) => routine.slots);
  }

  /** Load, fork if needed, apply, save - see `shared/fork.server.ts`. */
  private readonly editor: ForkableLibrary<Routine>;

  async list(athlete: Athlete): Promise<RoutineSummary[]> {
    const routines = await this.routines.listFor(athlete.id, athlete.preferences.showSampleData);
    return routines.map(toSummary);
  }

  /**
   * A routine plus the names of the templates its slots point at.
   *
   * A slot holds a template id, not a template - they are separate
   * aggregates - so the name is joined in here for display rather than being
   * carried around inside the routine.
   */
  async detail(athlete: Athlete, routineId: string): Promise<RoutineDetail | null> {
    const routine = await this.routines.findVisible(athlete.id, routineId);
    if (!routine) return null;

    const names = await this.templateNames(athlete);

    return {
      ...toSummary(routine),
      canRevert: routine.canRevert,
      isDeletable: routine.isDeletable,
      slots: routine.slots.map((slot) => ({
        id: slot.id,
        position: slot.position,
        templateId: slot.templateId,
        templateName: slot.templateId ? (names.get(slot.templateId) ?? 'Unknown') : null,
        isRestDay: slot.isRestDay,
      })),
    };
  }

  async create(athlete: Athlete, name: string, anchorDate: DateOnly): Promise<RoutineSummary> {
    const routine = Routine.create(athlete.id, name, anchorDate, this.deps);
    await this.unitOfWork.run(() => this.routines.save(routine));
    return toSummary(routine);
  }

  async rename(athlete: Athlete, routineId: string, name: string): Promise<RoutineMutation> {
    return this.editor.mutate(athlete.id, routineId, (routine) => routine.rename(name, this.deps.clock.now()));
  }

  async reanchor(athlete: Athlete, routineId: string, anchorDate: DateOnly): Promise<RoutineMutation> {
    return this.editor.mutate(athlete.id, routineId, (routine) => routine.reanchor(anchorDate, this.deps.clock.now()));
  }

  /**
   * Makes this the athlete's active routine, standing down whatever was
   * active before. Both routines are saved in the same transaction, because
   * a partial unique index refuses two active rows for one athlete - so the
   * intermediate state must never be committed.
   */
  async activate(athlete: Athlete, routineId: string): Promise<RoutineMutation> {
    return this.editor.edit(athlete.id, routineId, async (copy) => {
      const currentlyActive = await this.routines.findActive(athlete.id);

      for (const routine of activateRoutine(copy.editable, currentlyActive, this.deps.clock.now())) {
        await this.routines.save(routine);
      }
      return ok();
    });
  }

  async deactivate(athlete: Athlete, routineId: string): Promise<RoutineMutation> {
    return this.editor.mutate(athlete.id, routineId, (routine) => routine.deactivate(this.deps.clock.now()));
  }

  /**
   * Mints - or hands back - the token a share link and QR code carry.
   *
   * Goes through the same editor as every other mutation, so sharing a
   * sample forks it first: a token names one row, and a sample belongs to
   * everyone. The caller has to follow `forkedId`, because the token it gets
   * back belongs to the fork, not to the sample it was asked about.
   */
  async share(athlete: Athlete, routineId: string): Promise<Result<{ forkedId: string | null; token: string }, 'not-found'>> {
    let token = '';
    const outcome: RoutineMutation = await this.editor.edit(athlete.id, routineId, async (copy) => {
      token = copy.editable.share(this.deps);
      await this.routines.save(copy.editable);
      return ok<void>(undefined);
    });

    return outcome.ok ? ok({ forkedId: outcome.value.forkedId, token }) : err(outcome.error);
  }

  /** Revokes the link. The token is dropped, never reissued. */
  async unshare(athlete: Athlete, routineId: string): Promise<RoutineMutation> {
    return this.editor.mutate(athlete.id, routineId, (routine) => routine.unshare(this.deps.clock.now()));
  }

  async addSlot(athlete: Athlete, routineId: string, templateId: string | null): Promise<RoutineMutation> {
    return this.editor.mutate(athlete.id, routineId, (routine) => routine.addSlot(templateId, this.deps));
  }

  async removeSlot(athlete: Athlete, routineId: string, slotId: string): Promise<RoutineMutation> {
    return this.editor.mutate(athlete.id, routineId, (routine, translate) =>
      routine.removeSlot(translate(slotId), this.deps.clock.now()),
    );
  }

  async moveSlot(athlete: Athlete, routineId: string, slotId: string, direction: MoveDirection): Promise<RoutineMutation> {
    return this.editor.mutate(athlete.id, routineId, (routine, translate) =>
      routine.moveSlot(translate(slotId), direction, this.deps.clock.now()),
    );
  }

  async remove(athlete: Athlete, routineId: string): Promise<Result<void, 'not-found' | 'sample'>> {
    return this.editor.remove(athlete.id, routineId);
  }

  /** See `ForkableLibrary.revert` - the caller redirects to the original. */
  async revert(
    athlete: Athlete,
    routineId: string,
  ): Promise<Result<{ forkedFromId: string }, 'not-found' | 'nothing-to-revert'>> {
    return this.editor.revert(athlete.id, routineId);
  }

  private async templateNames(athlete: Athlete): Promise<Map<string, string>> {
    const templates = await this.templates.listNamesFor(athlete.id, athlete.preferences.showSampleData);
    return new Map(templates.map((template) => [template.id, template.name]));
  }
}
