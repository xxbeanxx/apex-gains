import { beforeEach, describe, expect, it } from 'vitest';

import { type ContractSubject, type RepositorySet, adminAction, ids, seedAthletes } from './harness';

export function describeAdminActionsContract(subject: ContractSubject): void {
  describe('AdminActionsRepository', () => {
    let repositories: RepositorySet;

    beforeEach(async () => {
      repositories = await subject.reset();
      await seedAthletes(repositories);
    });

    it('round-trips an entry', async () => {
      await repositories.adminActions.record(
        adminAction({ action: 'grant-admin', actorId: ids.athlete, targetId: ids.otherAthlete }),
      );

      const [found] = await repositories.adminActions.listRecent(10);

      expect(found?.action).toBe('grant-admin');
      expect(found?.actorId).toBe(ids.athlete);
      expect(found?.targetId).toBe(ids.otherAthlete);
    });

    it('lists newest first, capped at the limit', async () => {
      await repositories.adminActions.record(
        adminAction({ id: ids.own, action: 'grant-admin', createdAt: new Date('2026-09-01T00:00:00Z') }),
      );
      await repositories.adminActions.record(
        adminAction({ id: ids.extra, action: 'revoke-admin', createdAt: new Date('2026-09-03T00:00:00Z') }),
      );
      await repositories.adminActions.record(
        adminAction({ id: ids.child, action: 'remove-account', createdAt: new Date('2026-09-02T00:00:00Z') }),
      );

      const actions = (await repositories.adminActions.listRecent(2)).map((found) => found.action);

      expect(actions).toEqual(['revoke-admin', 'remove-account']);
    });

    /**
     * The whole point of `on delete set null` over cascade: deleting an
     * account must not erase the record of what happened to it, or of what
     * it did to someone else.
     */
    it('keeps the entry, denormalised email included, once the actor or target account is gone', async () => {
      await repositories.adminActions.record(
        adminAction({
          action: 'remove-account',
          actorId: ids.athlete,
          actorEmail: 'actor@example.com',
          targetId: ids.otherAthlete,
          targetEmail: 'target@example.com',
        }),
      );

      const actor = await repositories.athletes.findById(ids.athlete);
      await repositories.athletes.remove(actor!);
      const target = await repositories.athletes.findById(ids.otherAthlete);
      await repositories.athletes.remove(target!);

      const [found] = await repositories.adminActions.listRecent(10);

      expect(found?.actorId).toBeNull();
      expect(found?.actorEmail).toBe('actor@example.com');
      expect(found?.targetId).toBeNull();
      expect(found?.targetEmail).toBe('target@example.com');
    });
  });
}
