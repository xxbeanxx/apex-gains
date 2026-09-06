import type { DomainDeps } from '~application/ports/domain-deps';
import type { AthletesRepository } from '~application/ports/persistence/athletes-repository';
import type { ExercisesRepository } from '~application/ports/persistence/exercises-repository';
import type { PlansRepository } from '~application/ports/persistence/plans-repository';
import type { UnitOfWork } from '~application/ports/persistence/unit-of-work';
import type { WorkoutsRepository } from '~application/ports/persistence/workouts-repository';
import type { Athlete } from '~domain/athlete/athlete';
import type { Exercise } from '~domain/exercise/exercise';
import { Plan } from '~domain/plan/plan';
import { type Result, err, ok } from '~domain/shared/result';
import type { DateOnly } from '~domain/values/date-only';
import type { Workout } from '~domain/workout/workout';

/** One day of the shared cycle, as the confirmation page lists it. */
export type SharedSlotView = {
  position: number;
  workoutName: string | null;
  isRestDay: boolean;
};

/**
 * What a share link resolves to, before the athlete decides to take it.
 *
 * The counts are the point of the page: importing writes into the athlete's
 * library as well as their plans, and they should see how much before
 * they agree to it rather than afterwards.
 */
export type SharedPlanPreview = {
  name: string;
  /** The athlete who shared it, for a recipient deciding whether to trust the link. */
  sharedBy: string | null;
  /** Pre-fills the importer's anchor-date field; they can move it before confirming. */
  anchorDate: string;
  slots: SharedSlotView[];
  /** How many workouts the import would add to their library. */
  newWorkouts: number;
  /** How many exercises it would add - the rest already have a counterpart. */
  newExercises: number;
  /** Their own plan, reached through their own link: offer the plan, not an import. */
  ownPlanId: string | null;
};

export type ImportOutcome = Result<{ planId: string }, 'not-found'>;

/**
 * Everything one import would write, worked out before any of it is saved.
 *
 * The confirmation page and the import itself need the same answer - how
 * many rows this adds - so both build a plan and only one of them saves it.
 */
type ImportPlan = {
  plan: Plan;
  workouts: Workout[];
  exercises: Exercise[];
};

/**
 * Taking a plan somebody else shared.
 *
 * A share link hands over a plan, but a plan is only slot positions
 * and workout ids: the workouts it schedules and the exercises those name
 * belong to the athlete who shared it, and are invisible and unusable to
 * anyone else. So an import is a deep copy - plan, then workouts, then
 * exercises - and the interesting part is how much of it to *skip*.
 *
 * Nothing is copied that the importing athlete can already use. A sample is
 * shared library data they can see already; their own fork of that sample
 * stands in for it where they have one; and an exercise of theirs under the
 * same name is the same movement for this purpose - `exercises_user_name_unique`
 * means it has to be, since they cannot hold two. Only what is left over is
 * copied, by the `copyForImport` on each aggregate.
 *
 * Workouts are the deliberate exception: a workout with a familiar name
 * can hold quite different exercises, so one is always copied rather than
 * matched by name. Importing the same link twice therefore leaves a second
 * set of workouts behind, which is why the confirmation page says how many
 * it is about to add.
 */
export class PlanImportService {
  constructor(
    private readonly plans: PlansRepository,
    private readonly workouts: WorkoutsRepository,
    private readonly exercises: ExercisesRepository,
    private readonly athletes: AthletesRepository,
    private readonly unitOfWork: UnitOfWork,
    private readonly deps: DomainDeps,
  ) {}

  /** What the link holds and what taking it would cost, or null for a dead token. */
  async preview(athlete: Athlete, shareToken: string): Promise<SharedPlanPreview | null> {
    const shared = await this.plans.findByShareToken(shareToken);
    if (!shared) return null;

    const sourceWorkouts = await this.sourceWorkouts(shared);
    const owner = shared.ownership.userId;

    // Planning mints ids and timestamps for rows this call will not save.
    // That is pure construction - no I/O, nothing reserved - and it is what
    // makes the counts below the same answer the import will act on.
    const plan = await this.plan(athlete, shared, sourceWorkouts, shared.anchorDate);

    return {
      name: shared.name,
      sharedBy: owner === null ? null : ((await this.athletes.findById(owner))?.name ?? null),
      anchorDate: shared.anchorDate.value,
      slots: shared.slots.map((slot) => ({
        position: slot.position,
        workoutName: slot.workoutId === null ? null : (sourceWorkouts.get(slot.workoutId)?.name ?? 'Unknown'),
        isRestDay: slot.isRestDay,
      })),
      newWorkouts: plan.workouts.length,
      newExercises: plan.exercises.length,
      ownPlanId: shared.ownership.isOwnedBy(athlete.id) ? shared.id : null,
    };
  }

  /**
   * Copies the shared plan into the athlete's account, anchored to the
   * date they chose.
   *
   * One transaction, and the save order is the schema's: exercises before
   * the workouts whose entries reference them (`on delete restrict`), and
   * workouts before the plan whose slots reference them.
   */
  async import(athlete: Athlete, shareToken: string, anchorDate: DateOnly): Promise<ImportOutcome> {
    return this.unitOfWork.run(async () => {
      const shared = await this.plans.findByShareToken(shareToken);
      if (!shared) return err('not-found' as const);

      const plan = await this.plan(athlete, shared, await this.sourceWorkouts(shared), anchorDate);

      for (const exercise of plan.exercises) await this.exercises.save(exercise);
      for (const workout of plan.workouts) await this.workouts.save(workout);
      await this.plans.save(plan.plan);

      return ok({ planId: plan.plan.id });
    });
  }

  /** The workouts the shared plan's slots name, by id - they are not the importer's to list. */
  private async sourceWorkouts(shared: Plan): Promise<Map<string, Workout>> {
    const ids = shared.slots.map((slot) => slot.workoutId).filter((id): id is string => id !== null);
    const found = await this.workouts.findManyByIds([...new Set(ids)]);
    return new Map(found.map((workout) => [workout.id, workout]));
  }

  private async plan(
    athlete: Athlete,
    shared: Plan,
    sourceWorkouts: Map<string, Workout>,
    anchorDate: DateOnly,
  ): Promise<ImportPlan> {
    const workoutIdFor = new Map<string, string>();
    const toCopy: Workout[] = [];

    for (const source of sourceWorkouts.values()) {
      const reused = await this.reusableWorkout(athlete, source);
      if (reused) workoutIdFor.set(source.id, reused);
      else toCopy.push(source);
    }

    const exerciseIdFor = await this.resolveExercises(athlete, toCopy);

    const workouts = toCopy.map((source) => {
      const copy = source.copyForImport(athlete.id, (id) => exerciseIdFor.reuse.get(id) ?? id, this.deps);
      workoutIdFor.set(source.id, copy.id);
      return copy;
    });

    return {
      // A slot naming a workout that resolved to nothing keeps its own id,
      // which the importer cannot see - the slot renders as unknown rather
      // than pointing at somebody else's row.
      plan: shared.copyForImport(athlete.id, anchorDate, (id) => workoutIdFor.get(id) ?? id, this.deps),
      workouts,
      exercises: exerciseIdFor.created,
    };
  }

  /**
   * The workout already standing in for this one, if any.
   *
   * Only two cases qualify, and neither is a name match: a workout the
   * athlete already owns (their own link, come back to them), and a sample -
   * or their fork of it, which their library shows in the sample's place.
   * Reusing the fork is not just tidiness; copying instead would leave two
   * rows forked from one sample, and `findForkOf` answers with one.
   */
  private async reusableWorkout(athlete: Athlete, source: Workout): Promise<string | null> {
    if (source.ownership.isOwnedBy(athlete.id)) return source.id;

    if (source.ownership.isSample) {
      const fork = await this.workouts.findForkOf(athlete.id, source.id);
      return fork?.id ?? source.id;
    }

    if (source.forkedFromId === null) return null;

    const fork = await this.workouts.findForkOf(athlete.id, source.forkedFromId);
    return fork?.id ?? null;
  }

  /**
   * What each exercise the copied workouts name becomes for the importer.
   *
   * `reuse` maps a source exercise id onto whatever stands in for it -
   * including the copies about to be created, so a caller only needs the one
   * map; `created` is the subset that has to be saved.
   */
  private async resolveExercises(
    athlete: Athlete,
    workouts: readonly Workout[],
  ): Promise<{ reuse: Map<string, string>; created: Exercise[] }> {
    const ids = new Set(workouts.flatMap((workout) => workout.exercises.map((entry) => entry.exerciseId)));
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
   * Unlike workouts, a name match counts. `exercises_user_name_unique`
   * means the athlete cannot hold two exercises under one name, so copying
   * over a name they already use is not merely untidy - it is a constraint
   * violation. Treating same-named as the same movement is what makes an
   * import of a familiar plan add nothing to the library, and what makes
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
