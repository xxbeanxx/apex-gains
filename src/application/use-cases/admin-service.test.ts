import { beforeEach, describe, expect, it } from 'vitest';

import { AdminService } from '~application/use-cases/admin-service';
import { Athlete } from '~domain/athlete/athlete';
import { Session } from '~domain/session/session';
import { fixedClock } from '~domain/shared/clock';
import { sequentialIds } from '~domain/shared/ids';
import { sequentialSecrets } from '~domain/shared/secrets';
import { DateOnly } from '~domain/values/date-only';
import { InMemoryAdminActionsRepository } from '~infrastructure/persistence/in-memory/admin-actions-repository';
import { InMemoryAthletesRepository } from '~infrastructure/persistence/in-memory/athletes-repository';
import { InMemorySessionsRepository } from '~infrastructure/persistence/in-memory/sessions-repository';
import { InMemoryUnitOfWork } from '~infrastructure/persistence/in-memory/unit-of-work';

const NOW = new Date('2026-09-04T12:00:00Z');
const TODAY = DateOnly.parse('2026-09-04');
const deps = { ids: sequentialIds('gen'), clock: fixedClock(NOW), secrets: sequentialSecrets('token') };

let athletes: InMemoryAthletesRepository;
let sessions: InMemorySessionsRepository;
let adminActions: InMemoryAdminActionsRepository;
let service: AdminService;

/** Registers an athlete, back-dating the account so ordering is assertable. */
async function register(name: string, options: { isAdmin?: boolean; joinedDaysAgo?: number } = {}): Promise<Athlete> {
  const joinedAt = new Date(NOW.getTime() - (options.joinedDaysAgo ?? 0) * 86_400_000);
  const athlete = Athlete.register(
    { googleSub: `google-${name}`, email: `${name}@example.com`.toLowerCase(), name, avatarUrl: null },
    { ids: deps.ids, clock: fixedClock(joinedAt) },
  );
  if (options.isAdmin) athlete.changeAdminAccess(true, joinedAt);
  await athletes.save(athlete);
  return athlete;
}

/** Opens a day for an athlete and logs `setCount` sets into it. */
async function train(athlete: Athlete, date: DateOnly, setCount: number, isRestDay = false): Promise<void> {
  const session = Session.open(athlete.id, date, { planId: null, workoutId: null, isRestDay }, deps);
  for (let i = 0; i < setCount; i += 1) {
    session.logSet('exercise-1', { reps: 10 }, deps);
  }
  await sessions.add(session);
  await sessions.save(session);
}

beforeEach(() => {
  athletes = new InMemoryAthletesRepository();
  sessions = new InMemorySessionsRepository();
  adminActions = new InMemoryAdminActionsRepository();
  athletes.referencedBy(adminActions);
  service = new AdminService(athletes, sessions, adminActions, new InMemoryUnitOfWork(), deps);
});

describe('accounts', () => {
  it('lists every athlete, oldest account first', async () => {
    const admin = await register('Admin', { isAdmin: true, joinedDaysAgo: 10 });
    await register('Newcomer', { joinedDaysAgo: 1 });

    const accounts = await service.accounts(admin);

    expect(accounts.map((account) => account.name)).toEqual(['Admin', 'Newcomer']);
  });

  it('marks the administrator doing the looking', async () => {
    const admin = await register('Admin', { isAdmin: true });
    await register('Other');

    const accounts = await service.accounts(admin);

    expect(accounts.map((account) => [account.name, account.isSelf, account.isAdmin])).toEqual([
      ['Admin', true, true],
      ['Other', false, false],
    ]);
  });

  it('folds in each athlete’s training totals', async () => {
    const admin = await register('Admin', { isAdmin: true });
    const other = await register('Other');
    await train(other, TODAY.minusDays(2), 3);
    await train(other, TODAY, 2);

    const accounts = await service.accounts(admin);
    const view = accounts.find((account) => account.name === 'Other')!;

    expect(view.workoutCount).toBe(2);
    expect(view.setCount).toBe(5);
    expect(view.lastActiveOn).toBe(TODAY.value);
  });

  it('zeroes an athlete who has never opened a day', async () => {
    const admin = await register('Admin', { isAdmin: true });

    const [view] = await service.accounts(admin);

    expect(view).toMatchObject({ workoutCount: 0, setCount: 0, lastActiveOn: null });
  });

  it('counts a rest day as activity but not as a workout', async () => {
    const admin = await register('Admin', { isAdmin: true });
    await train(admin, TODAY, 0, true);

    const [view] = await service.accounts(admin);

    expect(view.workoutCount).toBe(0);
    expect(view.lastActiveOn).toBe(TODAY.value);
  });

  it("buckets joinedOn using the athlete's own timezone, not UTC's", async () => {
    const admin = await register('Admin', { isAdmin: true });
    const joinedAt = new Date('2026-09-03T23:30:00Z'); // late on the 3rd in UTC
    const other = Athlete.register(
      { googleSub: 'google-other-tz', email: 'othertz@example.com', name: 'OtherTz', avatarUrl: null },
      { ids: deps.ids, clock: fixedClock(joinedAt) },
    );
    other.changeTimezone('Asia/Karachi', joinedAt); // UTC+5: already the 4th there
    await athletes.save(other);

    const accounts = await service.accounts(admin);
    const view = accounts.find((account) => account.name === 'OtherTz')!;

    expect(view.joinedOn).toBe('2026-09-04');
  });
});

describe('overview', () => {
  it('sums the instance and counts administrators', async () => {
    const admin = await register('Admin', { isAdmin: true });
    const other = await register('Other', { isAdmin: true });
    await register('Third');
    await train(admin, TODAY, 2);
    await train(other, TODAY, 3);

    const overview = await service.overview(admin);

    expect(overview).toMatchObject({
      totalAccounts: 3,
      administrators: 2,
      totalWorkouts: 2,
      totalSets: 5,
    });
  });

  it('counts only sign-ups and activity inside the recent window', async () => {
    const admin = await register('Admin', { isAdmin: true, joinedDaysAgo: 400 });
    const recent = await register('Recent', { joinedDaysAgo: 3 });
    await register('Lapsed', { joinedDaysAgo: 200 });

    await train(recent, TODAY.minusDays(2), 1);
    await train(admin, TODAY.minusDays(120), 1);

    const overview = await service.overview(admin);

    expect(overview.joinedRecently).toBe(1);
    expect(overview.activeRecently).toBe(1);
  });

  it('leads the shortlists with the newest accounts and the busiest athletes', async () => {
    const admin = await register('Admin', { isAdmin: true, joinedDaysAgo: 10 });
    const busy = await register('Busy', { joinedDaysAgo: 5 });
    const newest = await register('Newest', { joinedDaysAgo: 1 });
    await train(busy, TODAY, 9);
    await train(newest, TODAY, 1);

    const overview = await service.overview(admin);

    expect(overview.newestAccounts.map((account) => account.name)).toEqual(['Newest', 'Busy', 'Admin']);
    // Only athletes who have logged something appear, hardest-working first.
    expect(overview.busiestAccounts.map((account) => account.name)).toEqual(['Busy', 'Newest']);
  });

  it('leads with the most recent admin actions', async () => {
    const admin = await register('Admin', { isAdmin: true });
    const other = await register('Other');
    await service.changeAdminAccess(admin, other.id, true);

    const overview = await service.overview(admin);

    expect(overview.recentActions).toEqual([
      expect.objectContaining({ action: 'grant-admin', actorEmail: admin.email, targetEmail: other.email }),
    ]);
  });
});

describe('account', () => {
  it('resolves one account with its preferences', async () => {
    const admin = await register('Admin', { isAdmin: true });
    const other = await register('Other');

    const view = await service.account(admin, other.id);

    expect(view).toMatchObject({ name: 'Other', weightUnit: 'lb', distanceUnit: 'km', showSampleData: true });
  });

  it('returns null for an unknown id', async () => {
    const admin = await register('Admin', { isAdmin: true });

    await expect(service.account(admin, 'nobody')).resolves.toBeNull();
  });
});

describe('changeAdminAccess', () => {
  it('grants access and persists it', async () => {
    const admin = await register('Admin', { isAdmin: true });
    const other = await register('Other');

    const outcome = await service.changeAdminAccess(admin, other.id, true);

    expect(outcome).toEqual({ ok: true, value: { name: 'Other' } });
    await expect(athletes.findById(other.id)).resolves.toMatchObject({ isAdmin: true });
  });

  it('revokes access again', async () => {
    const admin = await register('Admin', { isAdmin: true });
    const other = await register('Other', { isAdmin: true });

    await service.changeAdminAccess(admin, other.id, false);

    await expect(athletes.findById(other.id)).resolves.toMatchObject({ isAdmin: false });
  });

  it('refuses to change the administrator’s own access', async () => {
    const admin = await register('Admin', { isAdmin: true });

    const outcome = await service.changeAdminAccess(admin, admin.id, false);

    expect(outcome).toEqual({ ok: false, error: 'self' });
    await expect(athletes.findById(admin.id)).resolves.toMatchObject({ isAdmin: true });
  });

  it('reports an unknown account as not found', async () => {
    const admin = await register('Admin', { isAdmin: true });

    await expect(service.changeAdminAccess(admin, 'nobody', true)).resolves.toEqual({ ok: false, error: 'not-found' });
  });

  it('records a grant in the audit trail', async () => {
    const admin = await register('Admin', { isAdmin: true });
    const other = await register('Other');

    await service.changeAdminAccess(admin, other.id, true);

    const [entry] = await adminActions.listRecent(10);
    expect(entry).toMatchObject({
      action: 'grant-admin',
      actorId: admin.id,
      actorEmail: admin.email,
      targetId: other.id,
      targetEmail: other.email,
    });
  });

  it('records a revoke, distinctly from a grant', async () => {
    const admin = await register('Admin', { isAdmin: true });
    const other = await register('Other', { isAdmin: true });

    await service.changeAdminAccess(admin, other.id, false);

    const [entry] = await adminActions.listRecent(10);
    expect(entry?.action).toBe('revoke-admin');
  });

  it('records nothing when the mutation is refused', async () => {
    const admin = await register('Admin', { isAdmin: true });

    await service.changeAdminAccess(admin, admin.id, false);

    expect(await adminActions.listRecent(10)).toEqual([]);
  });
});

describe('removeAccount', () => {
  it('deletes another athlete', async () => {
    const admin = await register('Admin', { isAdmin: true });
    const other = await register('Other');

    const outcome = await service.removeAccount(admin, other.id);

    expect(outcome).toEqual({ ok: true, value: { name: 'Other' } });
    await expect(athletes.findById(other.id)).resolves.toBeNull();
  });

  it('refuses to delete the administrator’s own account', async () => {
    const admin = await register('Admin', { isAdmin: true });

    const outcome = await service.removeAccount(admin, admin.id);

    expect(outcome).toEqual({ ok: false, error: 'self' });
    await expect(athletes.findById(admin.id)).resolves.not.toBeNull();
  });

  it('reports an unknown account as not found', async () => {
    const admin = await register('Admin', { isAdmin: true });

    await expect(service.removeAccount(admin, 'nobody')).resolves.toEqual({ ok: false, error: 'not-found' });
  });

  it('records the deletion, surviving the deleted account it names', async () => {
    const admin = await register('Admin', { isAdmin: true });
    const other = await register('Other');

    await service.removeAccount(admin, other.id);

    const [entry] = await adminActions.listRecent(10);
    expect(entry).toMatchObject({ action: 'remove-account', actorId: admin.id, targetId: null, targetEmail: other.email });
  });

  it('records nothing when the mutation is refused', async () => {
    const admin = await register('Admin', { isAdmin: true });

    await service.removeAccount(admin, admin.id);

    expect(await adminActions.listRecent(10)).toEqual([]);
  });
});
