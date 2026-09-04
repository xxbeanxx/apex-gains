/**
 * Exercises, templates and routines are either a user's own or shared
 * sample data (a null `userId`), and a user edits a sample by forking it
 * into a personal copy - see CLAUDE.md's "Sample data and fork-on-write".
 *
 * This is the single place that null is interpreted, so "is this mine", "is
 * this a sample" and "may I see this" mean the same thing everywhere.
 */
export class Ownership {
  private constructor(readonly userId: string | null) {}

  /** Shared, read-only library data seeded by `db/seed.ts`. */
  static sample(): Ownership {
    return new Ownership(null);
  }

  static of(userId: string): Ownership {
    return new Ownership(userId);
  }

  /** Reads the nullable `user_id` column back into the distinction it encodes. */
  static fromUserId(userId: string | null): Ownership {
    return userId === null ? Ownership.sample() : Ownership.of(userId);
  }

  get isSample(): boolean {
    return this.userId === null;
  }

  isOwnedBy(userId: string): boolean {
    return this.userId === userId;
  }

  /**
   * A user sees their own rows plus the shared samples. Whether a *forked*
   * sample should still be listed is a query concern (it depends on the
   * user's other rows), so that stays in the repositories'
   * `sampleOrOwn*Where` builders rather than here.
   */
  isVisibleTo(userId: string): boolean {
    return this.isSample || this.isOwnedBy(userId);
  }

  equals(other: Ownership): boolean {
    return this.userId === other.userId;
  }
}
