import { describe, expect, it } from 'vitest';
import { changeAdminAccess, closeOwnAccount, removeAccount } from '~domain/athlete/administration';
import { Athlete } from '~domain/athlete/athlete';
import { fixedClock } from '~domain/shared/clock';
import { sequentialIds } from '~domain/shared/ids';

const NOW = new Date('2026-09-04T12:00:00Z');

// One generator across the whole file: a fresh `sequentialIds` per call
// would hand every athlete the id "athlete-1", and each of these rules turns
// on whether two athletes are the same one.
const deps = { ids: sequentialIds('athlete'), clock: fixedClock(NOW) };

let seq = 0;
function athlete(isAdmin = false): Athlete {
  seq += 1;
  const registered = Athlete.register(
    { googleSub: `google-${seq}`, email: `athlete-${seq}@example.com`, name: `Athlete ${seq}`, avatarUrl: null },
    deps,
  );
  if (isAdmin) registered.changeAdminAccess(true, NOW);
  return registered;
}

describe('changeAdminAccess', () => {
  it('grants access to another athlete', () => {
    const actor = athlete(true);
    const target = athlete();

    const outcome = changeAdminAccess(actor, target, true, NOW);

    expect(outcome.ok).toBe(true);
    expect(target.isAdmin).toBe(true);
  });

  it('withdraws another administrator’s access', () => {
    const actor = athlete(true);
    const target = athlete(true);

    const outcome = changeAdminAccess(actor, target, false, NOW);

    expect(outcome.ok).toBe(true);
    expect(target.isAdmin).toBe(false);
  });

  it('refuses to change the actor’s own access', () => {
    const actor = athlete(true);

    const outcome = changeAdminAccess(actor, actor, false, NOW);

    expect(outcome).toEqual({ ok: false, error: 'self' });
    expect(actor.isAdmin).toBe(true);
  });

  it('leaves an administrator standing however many others are revoked', () => {
    const actor = athlete(true);
    const others = [athlete(true), athlete(true)];

    for (const other of others) changeAdminAccess(actor, other, false, NOW);

    expect([actor, ...others].filter((one) => one.isAdmin)).toEqual([actor]);
  });
});

describe('removeAccount', () => {
  it('allows deleting another athlete, confirmed by their email', () => {
    const target = athlete();

    expect(removeAccount(athlete(true), target, target.email).ok).toBe(true);
  });

  it('refuses to delete the actor’s own account', () => {
    const actor = athlete(true);

    expect(removeAccount(actor, actor, actor.email)).toEqual({ ok: false, error: 'self' });
  });

  it("refuses when the confirmation isn't the target's email - the actor's own included", () => {
    const actor = athlete(true);
    const target = athlete();

    expect(removeAccount(actor, target, actor.email)).toEqual({ ok: false, error: 'confirmation-mismatch' });
    expect(removeAccount(actor, target, '')).toEqual({ ok: false, error: 'confirmation-mismatch' });
  });
});

describe('closeOwnAccount', () => {
  it('allows an ordinary athlete to close their own account', () => {
    const closing = athlete();

    expect(closeOwnAccount(closing, 1, closing.email).ok).toBe(true);
  });

  it('allows an administrator to close their own account when another administrator remains', () => {
    const closing = athlete(true);

    expect(closeOwnAccount(closing, 2, closing.email).ok).toBe(true);
  });

  it('refuses when the athlete is the sole administrator', () => {
    const closing = athlete(true);

    expect(closeOwnAccount(closing, 1, closing.email)).toEqual({ ok: false, error: 'last-administrator' });
  });

  it("refuses when the confirmation isn't their email, before anything else", () => {
    const closing = athlete(true);

    expect(closeOwnAccount(closing, 1, 'someone@example.com')).toEqual({ ok: false, error: 'confirmation-mismatch' });
  });
});

describe('confirming a deletion', () => {
  /**
   * The confirmation is about deliberateness, not spelling.
   */
  it('ignores case and surrounding whitespace in the typed email', () => {
    const closing = athlete();

    expect(closeOwnAccount(closing, 1, `  ${closing.email.toUpperCase()} `).ok).toBe(true);
    expect(removeAccount(athlete(true), closing, `\t${closing.email.toUpperCase()}\n`).ok).toBe(true);
  });
});
