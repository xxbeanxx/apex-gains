import { type Result, err, ok } from '../shared/result';
import type { Athlete } from './athlete';

/**
 * The rules for one athlete acting on another through /admin.
 *
 * Neither belongs on `Athlete`: each is about a *pair* of athletes, and the
 * "at least one administrator survives" guarantee below is about the whole
 * set of them - the same reason `domain/plan/activation.ts` is a domain
 * service rather than a method.
 */

/** Why an administrator's action on an account was refused. */
export type AdminRefusal = 'self';

/** Why an athlete could not close their own account. */
export type CloseAccountRefusal = 'last-administrator';

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

/**
 * Whether `athlete` may close their own account.
 *
 * `removeAccount` above gets its "an administrator survives" guarantee
 * structurally, by restricting *whom* an administrator may act on - never
 * themselves, so whoever acted is still one afterwards. Closing your own
 * account is the opposite by definition, so the guarantee has to be checked
 * directly here instead: refused only when `athlete` is an administrator and
 * `administratorCount` - the size of that whole set, which only the caller
 * can know - is down to them alone. Anyone else may always close their own
 * account.
 */
export function closeOwnAccount(athlete: Athlete, administratorCount: number): Result<void, CloseAccountRefusal> {
  if (athlete.isAdmin && administratorCount <= 1) return err('last-administrator');
  return ok();
}
