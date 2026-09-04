/**
 * Builds a partial `T` for tests without scattering `as any` / `as Type`
 * casts through test bodies. The single cast lives here, once, so call
 * sites just pass the fields a given test actually reads.
 *
 * Values are typed `unknown` (not `T[K]`) so stubbing a generic method
 * (Drizzle's `db.select<...>()`, React Router's `context.get<T>()`, ...)
 * with a plain function doesn't fight TypeScript's generic-method
 * assignability checks - only the key names are checked against `T`.
 *
 * const session = mock<Session>({ name: "Greg" });
 */
export function mock<T>(overrides: { [K in keyof T]?: unknown } = {}): T {
  return overrides as T;
}
