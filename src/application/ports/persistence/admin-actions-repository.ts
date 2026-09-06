import type { AdminAction } from '~domain/admin/admin-action';

// Port: consumers depend on this interface, not on Drizzle/Postgres
// directly. `server/repositories/repositories.module.ts` picks which
// adapter backs it.
//
// Append-only by design: there is no update or delete here, mirroring the
// schema - a wrong entry is never the kind of thing this log corrects, only
// the kind of thing it should never fail to have recorded in the first
// place. Retention is unbounded, a written decision rather than an
// oversight at this instance's scale.
export interface AdminActionsRepository {
  record(action: AdminAction): Promise<void>;
  /** Newest first. */
  listRecent(limit: number): Promise<AdminAction[]>;
}
