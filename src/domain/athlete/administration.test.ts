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
  it('allows deleting another athlete', () => {
    expect(removeAccount(athlete(true), athlete()).ok).toBe(true);
  });

  it('refuses to delete the actor’s own account', () => {
    const actor = athlete(true);

    expect(removeAccount(actor, actor)).toEqual({ ok: false, error: 'self' });
  });
});

describe('closeOwnAccount', () => {
  it('allows an ordinary athlete to close their own account', () => {
    expect(closeOwnAccount(athlete(), 1).ok).toBe(true);
  });

  it('allows an administrator to close their own account when another administrator remains', () => {
    expect(closeOwnAccount(athlete(true), 2).ok).toBe(true);
  });

  it('refuses when the athlete is the sole administrator', () => {
    expect(closeOwnAccount(athlete(true), 1)).toEqual({ ok: false, error: 'last-administrator' });
  });
});
