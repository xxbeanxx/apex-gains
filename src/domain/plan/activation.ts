import type { Plan } from '~domain/plan/plan';

/**
 * "Only one plan per user may be active" is an invariant across a set of
 * plans, so no single `Plan` can enforce it alone - activating one has
 * to stand the previous one down. That makes this a domain service rather
 * than a method: it is domain logic with no natural aggregate to live on.
 *
 * Returns every plan whose state changed, which the caller must save
 * together in one transaction; the schema's partial unique index
 * (`plans_one_active_per_user`) is the backstop if that ever slips.
 */
export function activatePlan(target: Plan, currentlyActive: Plan | null, now: Date): Plan[] {
  if (currentlyActive && currentlyActive.id === target.id) {
    // Already the active one. Still stamp it, so "activate" is idempotent
    // rather than silently doing nothing.
    target.activate(now);
    return [target];
  }

  const changed: Plan[] = [];
  if (currentlyActive) {
    currentlyActive.deactivate(now);
    changed.push(currentlyActive);
  }

  target.activate(now);
  changed.push(target);
  return changed;
}
