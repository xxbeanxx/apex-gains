import { Inject, Injectable } from '@nestjs/common';

import type { Athlete } from '~/domain/athlete/athlete';
import type { Exercise } from '~/domain/exercise/exercise';
import { Routine } from '~/domain/routine/routine';
import { err, ok, type Result } from '~/domain/shared/result';
import type { WorkoutTemplate } from '~/domain/template/workout-template';
import type { DateOnly } from '~/domain/values/date-only';
import type { AthletesRepository } from '~/repositories/athletes-repository.server';
import type { ExercisesRepository } from '~/repositories/exercises-repository.server';
import type { RoutinesRepository } from '~/repositories/routines-repository.server';
import type { TemplatesRepository } from '~/repositories/templates-repository.server';
import type { UnitOfWork } from '~/repositories/unit-of-work.server';
import {
  ATHLETES_REPOSITORY,
  EXERCISES_REPOSITORY,
  ROUTINES_REPOSITORY,
  TEMPLATES_REPOSITORY,
  UNIT_OF_WORK,
} from '~/repositories/tokens';
import { DOMAIN_DEPS } from '~/services/shared/tokens';

import type { DomainDeps } from './shared/deps.server';

/** One day of the shared cycle, as the confirmation page lists it. */
export type SharedSlotView = {
  position: number;
  templateName: string | null;
  isRestDay: boolean;
};

/**
 * What a share link resolves to, before the athlete decides to take it.
 *
 * The counts are the point of the page: importing writes into the athlete's
 * library as well as their routines, and they should see how much before
 * they agree to it rather than afterwards.
 */
export type SharedRoutinePreview = {
  name: string;
  /** The athlete who shared it, for a recipient deciding whether to trust the link. */
  sharedBy: string | null;
  /** Pre-fills the importer's anchor-date field; they can move it before confirming. */
  anchorDate: string;
  slots: SharedSlotView[];
  /** How many templates the import would add to their library. */
  newTemplates: number;
  /** How many exercises it would add - the rest already have a counterpart. */
  newExercises: number;
  /** Their own routine, reached through their own link: offer the routine, not an import. */
  ownRoutineId: string | null;
};

export type ImportOutcome = Result<{ routineId: string }, 'not-found'>;

/**
 * Everything one import would write, worked out before any of it is saved.
 *
 * The confirmation page and the import itself need the same answer - how
 * many rows this adds - so both build a plan and only one of them saves it.
 */
type ImportPlan = {
  routine: Routine;
  templates: WorkoutTemplate[];
  exercises: Exercise[];
};

/**
 * Taking a routine somebody else shared.
 *
 * A share link hands over a routine, but a routine is only slot positions
 * and template ids: the templates it schedules and the exercises those name
 * belong to the athlete who shared it, and are invisible and unusable to
 * anyone else. So an import is a deep copy - routine, then templates, then
 * exercises - and the interesting part is how much of it to *skip*.
 *
 * Nothing is copied that the importing athlete can already use. A sample is
 * shared library data they can see already; their own fork of that sample
 * stands in for it where they have one; and an exercise of theirs under the
 * same name is the same movement for this purpose - `exercises_user_name_unique`
 * means it has to be, since they cannot hold two. Only what is left over is
 * copied, by the `copyForImport` on each aggregate.
 *
 * Templates are the deliberate exception: a template with a familiar name
 * can hold quite different exercises, so one is always copied rather than
 * matched by name. Importing the same link twice therefore leaves a second
 * set of templates behind, which is why the confirmation page says how many
 * it is about to add.
 */
@Injectable()
export class RoutineImportService {
  constructor(
    @Inject(ROUTINES_REPOSITORY) private readonly routines: RoutinesRepository,
    @Inject(TEMPLATES_REPOSITORY) private readonly templates: TemplatesRepository,
    @Inject(EXERCISES_REPOSITORY) private readonly exercises: ExercisesRepository,
    @Inject(ATHLETES_REPOSITORY) private readonly athletes: AthletesRepository,
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: UnitOfWork,
    @Inject(DOMAIN_DEPS) private readonly deps: DomainDeps,
  ) {}

  /** What the link holds and what taking it would cost, or null for a dead token. */
  async preview(athlete: Athlete, shareToken: string): Promise<SharedRoutinePreview | null> {
    const shared = await this.routines.findByShareToken(shareToken);
    if (!shared) return null;

    const sourceTemplates = await this.sourceTemplates(shared);
    const owner = shared.ownership.userId;

    // Planning mints ids and timestamps for rows this call will not save.
    // That is pure construction - no I/O, nothing reserved - and it is what
    // makes the counts below the same answer the import will act on.
    const plan = await this.plan(athlete, shared, sourceTemplates, shared.anchorDate);

    return {
      name: shared.name,
      sharedBy: owner === null ? null : ((await this.athletes.findById(owner))?.name ?? null),
      anchorDate: shared.anchorDate.value,
      slots: shared.slots.map((slot) => ({
        position: slot.position,
        templateName: slot.templateId === null ? null : (sourceTemplates.get(slot.templateId)?.name ?? 'Unknown'),
        isRestDay: slot.isRestDay,
      })),
      newTemplates: plan.templates.length,
      newExercises: plan.exercises.length,
      ownRoutineId: shared.ownership.isOwnedBy(athlete.id) ? shared.id : null,
    };
  }

  /**
   * Copies the shared routine into the athlete's account, anchored to the
   * date they chose.
   *
   * One transaction, and the save order is the schema's: exercises before
   * the templates whose entries reference them (`on delete restrict`), and
   * templates before the routine whose slots reference them.
   */
  async import(athlete: Athlete, shareToken: string, anchorDate: DateOnly): Promise<ImportOutcome> {
    return this.unitOfWork.run(async () => {
      const shared = await this.routines.findByShareToken(shareToken);
      if (!shared) return err('not-found' as const);

      const plan = await this.plan(athlete, shared, await this.sourceTemplates(shared), anchorDate);

      for (const exercise of plan.exercises) await this.exercises.save(exercise);
      for (const template of plan.templates) await this.templates.save(template);
      await this.routines.save(plan.routine);

      return ok({ routineId: plan.routine.id });
    });
  }

  /** The templates the shared routine's slots name, by id - they are not the importer's to list. */
  private async sourceTemplates(shared: Routine): Promise<Map<string, WorkoutTemplate>> {
    const ids = shared.slots.map((slot) => slot.templateId).filter((id): id is string => id !== null);
    const found = await this.templates.findManyByIds([...new Set(ids)]);
    return new Map(found.map((template) => [template.id, template]));
  }

  private async plan(
    athlete: Athlete,
    shared: Routine,
    sourceTemplates: Map<string, WorkoutTemplate>,
    anchorDate: DateOnly,
  ): Promise<ImportPlan> {
    const templateIdFor = new Map<string, string>();
    const toCopy: WorkoutTemplate[] = [];

    for (const source of sourceTemplates.values()) {
      const reused = await this.reusableTemplate(athlete, source);
      if (reused) templateIdFor.set(source.id, reused);
      else toCopy.push(source);
    }

    const exerciseIdFor = await this.resolveExercises(athlete, toCopy);

    const templates = toCopy.map((source) => {
      const copy = source.copyForImport(athlete.id, (id) => exerciseIdFor.reuse.get(id) ?? id, this.deps);
      templateIdFor.set(source.id, copy.id);
      return copy;
    });

    return {
      // A slot naming a template that resolved to nothing keeps its own id,
      // which the importer cannot see - the slot renders as unknown rather
      // than pointing at somebody else's row.
      routine: shared.copyForImport(athlete.id, anchorDate, (id) => templateIdFor.get(id) ?? id, this.deps),
      templates,
      exercises: exerciseIdFor.created,
    };
  }

  /**
   * The template already standing in for this one, if any.
   *
   * Only two cases qualify, and neither is a name match: a template the
   * athlete already owns (their own link, come back to them), and a sample -
   * or their fork of it, which their library shows in the sample's place.
   * Reusing the fork is not just tidiness; copying instead would leave two
   * rows forked from one sample, and `findForkOf` answers with one.
   */
  private async reusableTemplate(athlete: Athlete, source: WorkoutTemplate): Promise<string | null> {
    if (source.ownership.isOwnedBy(athlete.id)) return source.id;

    if (source.ownership.isSample) {
      const fork = await this.templates.findForkOf(athlete.id, source.id);
      return fork?.id ?? source.id;
    }

    if (source.forkedFromId === null) return null;

    const fork = await this.templates.findForkOf(athlete.id, source.forkedFromId);
    return fork?.id ?? null;
  }

  /**
   * What each exercise the copied templates name becomes for the importer.
   *
   * `reuse` maps a source exercise id onto whatever stands in for it -
   * including the copies about to be created, so a caller only needs the one
   * map; `created` is the subset that has to be saved.
   */
  private async resolveExercises(
    athlete: Athlete,
    templates: readonly WorkoutTemplate[],
  ): Promise<{ reuse: Map<string, string>; created: Exercise[] }> {
    const ids = new Set(templates.flatMap((template) => template.exercises.map((entry) => entry.exerciseId)));
    const sources = await this.exercises.findManyByIds([...ids]);

    const reuse = new Map<string, string>();
    const created: Exercise[] = [];

    for (const source of sources) {
      const existing = await this.reusableExercise(athlete, source);
      if (existing) {
        reuse.set(source.id, existing);
        continue;
      }

      const copy = source.copyForImport(athlete.id, this.deps);
      reuse.set(source.id, copy.id);
      created.push(copy);
    }

    return { reuse, created };
  }

  /**
   * The exercise already standing in for this one, if any.
   *
   * Unlike templates, a name match counts. `exercises_user_name_unique`
   * means the athlete cannot hold two exercises under one name, so copying
   * over a name they already use is not merely untidy - it is a constraint
   * violation. Treating same-named as the same movement is what makes an
   * import of a familiar routine add nothing to the library, and what makes
   * importing the same link twice reuse the first import's exercises.
   */
  private async reusableExercise(athlete: Athlete, source: Exercise): Promise<string | null> {
    if (source.ownership.isOwnedBy(athlete.id)) return source.id;

    if (source.ownership.isSample) {
      const fork = await this.exercises.findForkOf(athlete.id, source.id);
      return fork?.id ?? source.id;
    }

    if (source.forkedFromId !== null) {
      const fork = await this.exercises.findForkOf(athlete.id, source.forkedFromId);
      if (fork) return fork.id;
    }

    const byName = await this.exercises.findOwnByName(athlete.id, source.name);
    return byName?.id ?? null;
  }
}
