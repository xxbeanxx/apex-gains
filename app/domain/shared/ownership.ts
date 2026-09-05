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
   * Whether a user may reach this row at all: their own, or a shared sample.
   *
   * This is the rule for fetching one row by id. Which rows are *listed* is
   * a stricter question, because a forked sample drops out of the list -
   * that is `LibraryVisibility`.
   */
  isVisibleTo(userId: string): boolean {
    return this.isSample || this.isOwnedBy(userId);
  }

  equals(other: Ownership): boolean {
    return this.userId === other.userId;
  }
}

/**
 * The two nullable columns every forkable library row carries. Both adapter
 * families reduce their rows to this shape to ask `LibraryVisibility` about
 * them.
 */
export type ForkableRecord = {
  readonly id: string;
  readonly userId: string | null;
  readonly forkedFromId: string | null;
};

/**
 * Which rows of a forkable library a user's list shows: their own always,
 * plus - when they want sample data at all - the samples they have not
 * forked. A forked sample is excluded so the same logical item doesn't
 * appear twice, once as the shared original and once as the personal copy.
 *
 * The rule needs the user's *other* rows to answer, which is why it is a
 * type of its own rather than a method on `Ownership`: a single row cannot
 * tell whether it has been forked. `selectFrom` answers it for a set held in
 * memory; SQL cannot call a predicate, so the Drizzle adapters translate
 * this rule into a `where` clause instead (see
 * `repositories/drizzle/shared/visibility.ts`), and the two readings have to
 * be kept in step by the repository contract suite rather than by the
 * compiler.
 */
export class LibraryVisibility {
  private constructor(
    readonly userId: string,
    readonly includesSamples: boolean,
  ) {}

  static for(userId: string, showSampleData: boolean): LibraryVisibility {
    return new LibraryVisibility(userId, showSampleData);
  }

  /** The sample ids this user has already forked, read off their own rows. */
  forkedSampleIds(records: Iterable<ForkableRecord>): Set<string> {
    const ids = new Set<string>();
    for (const record of records) {
      if (record.userId === this.userId && record.forkedFromId !== null) {
        ids.add(record.forkedFromId);
      }
    }
    return ids;
  }

  /** The subset of `records` this user's list shows, in the order given. */
  selectFrom<T extends ForkableRecord>(records: readonly T[]): T[] {
    const forked = this.forkedSampleIds(records);
    return records.filter((record) => {
      if (record.userId === this.userId) return true;
      return this.includesSamples && record.userId === null && !forked.has(record.id);
    });
  }
}
