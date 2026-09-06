import type { Clock } from '../shared/clock';
import type { IdGenerator } from '../shared/ids';

/**
 * What an administrator did, on the only two things `/admin` lets one do to
 * another account. Reading an account's training records nothing - only a
 * mutation does.
 */
export const ADMIN_ACTION_KINDS = ['grant-admin', 'revoke-admin', 'remove-account'] as const;
export type AdminActionKind = (typeof ADMIN_ACTION_KINDS)[number];

export type AdminActionSnapshot = {
  readonly id: string;
  readonly actorId: string | null;
  readonly actorEmail: string;
  readonly targetId: string | null;
  readonly targetEmail: string;
  readonly action: AdminActionKind;
  readonly createdAt: Date;
};

/**
 * One entry in the audit trail - immutable once recorded, and never the
 * only copy of who the actor or target were: `actorEmail`/`targetEmail` are
 * captured at the moment of the action precisely so the entry still reads
 * once the account it names is gone. `actorId`/`targetId` stay for as long
 * as the row exists to be joined against, and go `null` rather than taking
 * the entry with them - see the schema's `on delete set null`.
 */
export class AdminAction {
  private constructor(
    readonly id: string,
    readonly actorId: string | null,
    readonly actorEmail: string,
    readonly targetId: string | null,
    readonly targetEmail: string,
    readonly action: AdminActionKind,
    readonly createdAt: Date,
  ) {}

  static record(
    action: AdminActionKind,
    actor: { readonly id: string; readonly email: string },
    target: { readonly id: string; readonly email: string },
    deps: { ids: IdGenerator; clock: Clock },
  ): AdminAction {
    return new AdminAction(deps.ids.next(), actor.id, actor.email, target.id, target.email, action, deps.clock.now());
  }

  static fromSnapshot(snapshot: AdminActionSnapshot): AdminAction {
    return new AdminAction(
      snapshot.id,
      snapshot.actorId,
      snapshot.actorEmail,
      snapshot.targetId,
      snapshot.targetEmail,
      snapshot.action,
      snapshot.createdAt,
    );
  }

  toSnapshot(): AdminActionSnapshot {
    return {
      id: this.id,
      actorId: this.actorId,
      actorEmail: this.actorEmail,
      targetId: this.targetId,
      targetEmail: this.targetEmail,
      action: this.action,
      createdAt: this.createdAt,
    };
  }
}
