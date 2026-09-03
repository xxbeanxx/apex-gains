/**
 * Port for "these writes happen together, or not at all".
 *
 * Two things need it. Saving one aggregate writes a root row and its
 * children as several statements. And a handful of use cases save two
 * aggregates - activating a routine stands the previous one down, and
 * forking a sample then mutating the fork must not be able to leave the copy
 * behind without the edit that caused it.
 *
 * Deliberately has no `commit`/`rollback`: callers describe a scope of work
 * and the adapter decides how to honour it. Throwing rolls back.
 */
export interface UnitOfWork {
  run<T>(work: () => Promise<T>): Promise<T>;
}
