import { desc } from 'drizzle-orm';

import { dbScope } from '~infrastructure/persistence/drizzle/index';
import { adminActions, type AdminAction as AdminActionRow } from '~infrastructure/persistence/drizzle/schema';
import { AdminAction, type AdminActionKind } from '~domain/admin/admin-action';

import type { AdminActionsRepository } from '~application/ports/persistence/admin-actions-repository';

function toAdminAction(row: AdminActionRow): AdminAction {
  return AdminAction.fromSnapshot({
    id: row.id,
    actorId: row.actorId,
    actorEmail: row.actorEmail,
    targetId: row.targetId,
    targetEmail: row.targetEmail,
    // `action` is a plain `text` column so the log never needs a schema
    // migration to record a new kind - the closed set the app can produce
    // lives in the domain instead.
    action: row.action as AdminActionKind,
    createdAt: row.createdAt,
  });
}

export class DrizzleAdminActionsRepository implements AdminActionsRepository {
  async record(action: AdminAction): Promise<void> {
    const snapshot = action.toSnapshot();
    await dbScope.insert(adminActions).values(snapshot);
  }

  async listRecent(limit: number): Promise<AdminAction[]> {
    const rows = await dbScope.query.adminActions.findMany({
      orderBy: desc(adminActions.createdAt),
      limit,
    });
    return rows.map(toAdminAction);
  }
}
