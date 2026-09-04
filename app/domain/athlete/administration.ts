import { err, ok, type Result } from '../shared/result';

import type { Athlete } from './athlete';

/**
 * The rules for one athlete acting on another through /admin.
 *
 * Neither belongs on `Athlete`: each is about a *pair* of athletes, and the
 * "at least one administrator survives" guarantee below is about the whole
 * set of them - the same reason `domain/routine/activation.ts` is a domain
 * service rather than a method.
 */

/** Why an administrator's action on an account was refused. */
export type AdminRefusal = 'self';

/**
 * An administrator may act on any account but their own.
 *
 * That single restriction is also what keeps the app from ever being locked
 * out of /admin: since an administrator can only revoke or delete *someone
 * else*, whoever performed the change is still an administrator afterwards,
 * so the set of them can never be emptied.
 */
function actingOnSelf(actor: Athlete, target: Athlete): boolean {
  return actor.id === target.id;
}

/** Grants or withdraws `target`'s administrator access on `actor`'s behalf. */
export function changeAdminAccess(actor: Athlete, target: Athlete, isAdmin: boolean, now: Date): Result<void, AdminRefusal> {
  if (actingOnSelf(actor, target)) return err('self');

  target.changeAdminAccess(isAdmin, now);
  return ok();
}

/**
 * Whether `actor` may delete `target`'s account outright. There is nothing
 * to mutate - the caller deletes the athlete and everything hanging off it -
 * so this is only the rule.
 */
export function removeAccount(actor: Athlete, target: Athlete): Result<void, AdminRefusal> {
  if (actingOnSelf(actor, target)) return err('self');

  return ok();
}
