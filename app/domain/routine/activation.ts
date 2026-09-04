import type { Routine } from './routine';

/**
 * "Only one routine per user may be active" is an invariant across a set of
 * routines, so no single `Routine` can enforce it alone - activating one has
 * to stand the previous one down. That makes this a domain service rather
 * than a method: it is domain logic with no natural aggregate to live on.
 *
 * Returns every routine whose state changed, which the caller must save
 * together in one transaction; the schema's partial unique index
 * (`routines_one_active_per_user`) is the backstop if that ever slips.
 */
export function activateRoutine(target: Routine, currentlyActive: Routine | null, now: Date): Routine[] {
  if (currentlyActive && currentlyActive.id === target.id) {
    // Already the active one. Still stamp it, so "activate" is idempotent
    // rather than silently doing nothing.
    target.activate(now);
    return [target];
  }

  const changed: Routine[] = [];
  if (currentlyActive) {
    currentlyActive.deactivate(now);
    changed.push(currentlyActive);
  }

  target.activate(now);
  changed.push(target);
  return changed;
}
