import {
  alreadyEditable,
  type EditableCopy,
  forkedFrom,
} from "~/domain/shared/forking";
import type { Positioned } from "~/domain/shared/ordered";
import type { Ownership } from "~/domain/shared/ownership";

import type { DomainDeps } from "./deps.server";

/**
 * What an aggregate must offer to take part in fork-on-write. Exercises,
 * templates and routines all satisfy it.
 */
export type Forkable<A> = {
  readonly id: string;
  readonly ownership: Ownership;
  editableCopyFor(userId: string, deps: DomainDeps): EditableCopy<A>;
};

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
    return forkedFrom(
      existingFork,
      childrenOf(aggregate),
      childrenOf(existingFork),
    );
  }

  return aggregate.editableCopyFor(userId, deps);
}
