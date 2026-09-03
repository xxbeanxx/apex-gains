/**
 * "Fork on first edit" - a user editing a shared sample gets a personal copy
 * of it, and the sample is left alone - is the same rule for exercises,
 * templates and routines. Each aggregate implements it as
 * `editableCopyFor(userId, ...)`; this is the shape they all return.
 *
 * The awkward part is child identity. Forking a routine gives its slots new
 * ids, so a `slotId` that arrived on the form refers to a slot on the
 * *sample*, not on the copy the mutation will actually apply to.
 * `translateChildId` closes that gap: it maps a child id on the original
 * onto its counterpart on the fork (by position), and is the identity
 * function when nothing was forked. Every adapter used to carry its own
 * version of this remapping.
 */
export type EditableCopy<A> = {
  /** The aggregate to mutate: the original when already owned, else the fork. */
  readonly editable: A;
  /**
   * The new aggregate's id when a fork happened, else null. Routes redirect
   * to it, because the edit is invisible at the original sample's URL.
   */
  readonly forkedId: string | null;
  readonly translateChildId: (childId: string) => string;
};

export const identityTranslation = (childId: string): string => childId;

/**
 * Builds the "already mine, nothing to do" case, which every
 * `editableCopyFor` needs before it considers forking.
 */
export function alreadyEditable<A>(aggregate: A): EditableCopy<A> {
  return {
    editable: aggregate,
    forkedId: null,
    translateChildId: identityTranslation,
  };
}

/**
 * Builds the forked case for an aggregate whose children are positional:
 * child ids are matched between original and fork by their shared position.
 */
export function forkedFrom<A extends { readonly id: string }>(
  fork: A,
  original: readonly { id: string; position: number }[],
  copied: readonly { id: string; position: number }[],
): EditableCopy<A> {
  const byPosition = new Map(copied.map((child) => [child.position, child.id]));
  const translation = new Map(
    original.map((child) => [child.id, byPosition.get(child.position)]),
  );

  return {
    editable: fork,
    forkedId: fork.id,
    // An id with no counterpart falls through unchanged; the caller then
    // finds nothing and reports a no-op, which is what should happen for a
    // stale form referencing a since-deleted child.
    translateChildId: (childId) => translation.get(childId) ?? childId,
  };
}
