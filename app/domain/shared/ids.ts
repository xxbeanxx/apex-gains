/**
 * Aggregates mint their own identifiers - forking a sample routine creates a
 * routine and a slot per cycle day, all before anything touches the
 * database. That has to work without I/O, so identity generation is a port
 * the domain is handed rather than something it reaches for.
 *
 * The columns keep their `defaultRandom()`, so a row inserted without an
 * explicit id still gets one; nothing in the schema had to change.
 */

export interface IdGenerator {
  next(): string;
}

/**
 * Production generator. `crypto.randomUUID` is a global in Node 19+ (and in
 * browsers), so the domain layer stays free of `node:` imports.
 */
export const randomIds: IdGenerator = {
  next: () => crypto.randomUUID(),
};

/**
 * Deterministic generator for tests: `sequentialIds("slot")` yields
 * "slot-1", "slot-2", ... so assertions can name the ids they expect
 * instead of matching UUID shapes.
 */
export function sequentialIds(prefix: string): IdGenerator {
  let n = 0;
  return { next: () => `${prefix}-${++n}` };
}
