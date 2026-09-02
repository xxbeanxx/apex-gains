import { vi } from "vitest";

/**
 * A Drizzle query chain (`db.select().from(...).where(...).orderBy(...)`,
 * `db.insert(...).values(...).returning()`, ...) is a thenable: every method
 * in the chain returns something chainable, and only awaiting/`.then`-ing
 * the final link actually resolves. This builds one that accepts any method
 * call, returns itself so the next link chains, and resolves to `result`
 * once awaited - so a single value stands in for a whole `db.select()...`
 * call regardless of which chain methods a given query happens to use.
 *
 * Only the outer `mock<typeof db>({ select: vi.fn(() => dbChain(rows)) })`
 * needs a cast (via `mock`); this helper itself stays cast-free.
 */
export function dbChain(result: unknown): PromiseLike<unknown> {
  const resolved = Promise.resolve(result);
  const target: PromiseLike<unknown> = { then: resolved.then.bind(resolved) };
  const proxy = new Proxy(target, {
    get(_target, prop) {
      if (prop === "then") return resolved.then.bind(resolved);
      if (prop === "catch") return resolved.catch.bind(resolved);
      if (prop === "finally") return resolved.finally.bind(resolved);
      return vi.fn(() => proxy);
    },
  });
  return proxy;
}
