import { alreadyEditable, type EditableCopy, forkedFrom } from '~/domain/shared/forking';
import type { Positioned } from '~/domain/shared/ordered';
import type { Ownership } from '~/domain/shared/ownership';
import { err, ok, type Result } from '~/domain/shared/result';
import type { UnitOfWork } from '~/repositories/unit-of-work.server';

import type { DomainDeps } from './deps.server';

/**
 * What an aggregate must offer to take part in fork-on-write. Exercises,
 * workouts and plans all satisfy it.
 */
export type Forkable<A> = {
  readonly id: string;
  readonly ownership: Ownership;
  readonly canRevert: boolean;
  readonly forkedFromId: string | null;
  editableCopyFor(userId: string, deps: DomainDeps): EditableCopy<A>;
};

/** The slice of a repository port fork-on-write needs. */
export type ForkableRepository<A> = {
  findVisible(userId: string, id: string): Promise<A | null>;
  findForkOf(userId: string, sampleId: string): Promise<A | null>;
  save(aggregate: A): Promise<void>;
};

/**
 * Every mutating use case on a forkable aggregate answers the same two
 * questions: did it apply, and did applying it fork a sample into a personal
 * copy? A non-null `forkedId` means the route should redirect - the edit
 * landed on a new row with its own URL, and would be invisible at the
 * sample's.
 */
export type ForkMutation = Result<{ forkedId: string | null }, 'not-found'>;

/**
 * Picks the aggregate a mutation should actually be applied to.
 *
 * The aggregate knows how to copy itself, but not whether the athlete has
 * *already* copied it - that is a question for the repository, and getting
 * it wrong would mint a second fork of the same sample on every edit. So the
 * three cases are resolved here:
 *
 *  - already the athlete's own: use it as-is;
 *  - a sample they've forked before: reuse that fork, mapping child ids from
 *    the sample onto it by position, exactly as a fresh fork would;
 *  - a sample they haven't: let the aggregate copy itself.
 *
 * Callers run this inside a UnitOfWork, so "check for a fork, then create
 * one" can't interleave with itself.
 */
export async function resolveEditableCopy<A extends Forkable<A>>(
  aggregate: A,
  userId: string,
  deps: DomainDeps,
  findExistingFork: (sampleId: string) => Promise<A | null>,
  childrenOf: (aggregate: A) => readonly Positioned[],
): Promise<EditableCopy<A>> {
  if (!aggregate.ownership.isSample) return alreadyEditable(aggregate);

  const existingFork = await findExistingFork(aggregate.id);
  if (existingFork) {
    return forkedFrom(existingFork, childrenOf(aggregate), childrenOf(existingFork));
  }

  return aggregate.editableCopyFor(userId, deps);
}

/**
 * Editing one kind of forkable aggregate.
 *
 * The sequence a mutation goes through is the same for exercises, workouts
 * and plans - open a transaction, load the row the athlete can see,
 * resolve which copy the edit lands on, apply, save, and report whether a
 * fork happened. Only the aggregate type and the repository differ, so a
 * service constructs one of these instead of restating the sequence.
 *
 * `mutate` covers the common case. A use case that has to do more inside the
 * same transaction - check a second aggregate first, or save two rows -
 * reaches for `edit`, which resolves the copy and then hands it over.
 */
export class ForkableEditor<A extends Forkable<A>> {
  constructor(
    protected readonly repository: ForkableRepository<A>,
    protected readonly unitOfWork: UnitOfWork,
    private readonly deps: DomainDeps,
    /**
     * The aggregate's ordered children, for translating a child id that
     * arrived on a form. An aggregate whose children carry no position
     * returns an empty list, making the translation the identity.
     */
    private readonly childrenOf: (aggregate: A) => readonly Positioned[],
  ) {}

  /** Load, resolve the copy, apply, save, report the fork. */
  async mutate(
    userId: string,
    id: string,
    apply: (aggregate: A, translateChildId: (childId: string) => string) => void,
  ): Promise<ForkMutation> {
    return this.edit(userId, id, async (copy) => {
      apply(copy.editable, copy.translateChildId);
      await this.repository.save(copy.editable);
      return ok(undefined);
    });
  }

  /**
   * Load and resolve the copy inside one transaction, then hand it to `work`,
   * which owns the saving. Its own failures join `not-found` in the result.
   */
  async edit<E extends string>(
    userId: string,
    id: string,
    work: (copy: EditableCopy<A>) => Promise<Result<void, E>>,
  ): Promise<Result<{ forkedId: string | null }, E | 'not-found'>> {
    return this.unitOfWork.run(async () => {
      const loaded = await this.repository.findVisible(userId, id);
      if (!loaded) return err('not-found' as const);

      const copy = await this.editableCopy(loaded, userId);
      const outcome = await work(copy);
      if (!outcome.ok) return err(outcome.error);

      return ok({ forkedId: copy.forkedId });
    });
  }

  private editableCopy(aggregate: A, userId: string): Promise<EditableCopy<A>> {
    return resolveEditableCopy(
      aggregate,
      userId,
      this.deps,
      (sampleId) => this.repository.findForkOf(userId, sampleId),
      this.childrenOf,
    );
  }
}

/**
 * A forkable library whose rows can simply be deleted: workouts and
 * plans.
 *
 * Exercises are deliberately not one of these. `on delete restrict` means an
 * exercise still named by a workout or a logged set refuses to go, and what
 * to tell the athlete about that is a decision only `ExerciseLibraryService`
 * can make - so it keeps its own `revert`.
 */
export class ForkableLibrary<A extends Forkable<A>> extends ForkableEditor<A> {
  constructor(
    repository: ForkableRepository<A> & { delete(id: string): Promise<void> },
    unitOfWork: UnitOfWork,
    deps: DomainDeps,
    childrenOf: (aggregate: A) => readonly Positioned[],
  ) {
    super(repository, unitOfWork, deps, childrenOf);
  }

  /**
   * Deletes the athlete's own row. A sample is refused rather than deleted -
   * it is shared with everyone, and hiding it is what the sample-data
   * preference is for.
   */
  async remove(userId: string, id: string): Promise<Result<void, 'not-found' | 'sample'>> {
    return this.unitOfWork.run(async () => {
      const aggregate = await this.repository.findVisible(userId, id);
      if (!aggregate) return err('not-found' as const);
      if (aggregate.ownership.isSample) return err('sample' as const);

      await this.deletable().delete(aggregate.id);
      return ok();
    });
  }

  /**
   * Discards a personal copy so the shared sample stands in for it again.
   * The caller redirects to the original, which is about to reappear in the
   * athlete's list now that nothing forks from it.
   */
  async revert(userId: string, id: string): Promise<Result<{ forkedFromId: string }, 'not-found' | 'nothing-to-revert'>> {
    return this.unitOfWork.run(async () => {
      const aggregate = await this.repository.findVisible(userId, id);
      if (!aggregate) return err('not-found' as const);
      if (!aggregate.canRevert || !aggregate.forkedFromId) {
        return err('nothing-to-revert' as const);
      }

      const forkedFromId = aggregate.forkedFromId;
      await this.deletable().delete(aggregate.id);
      return ok({ forkedFromId });
    });
  }

  private deletable(): { delete(id: string): Promise<void> } {
    return this.repository as ForkableRepository<A> & { delete(id: string): Promise<void> };
  }
}
