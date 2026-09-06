import { desc } from 'drizzle-orm';

import type { AdminActionsRepository } from '~application/ports/persistence/admin-actions-repository';
import { AdminAction, type AdminActionKind } from '~domain/admin/admin-action';
import { dbScope } from '~infrastructure/persistence/drizzle/index';
import { type AdminAction as AdminActionRow, adminActions } from '~infrastructure/persistence/drizzle/schema';

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
