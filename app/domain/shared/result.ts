/**
 * The domain never throws for outcomes a caller is expected to handle - a
 * routine that isn't there, a name already taken, a sample row that can't be
 * deleted. Those come back as values, so a route action has to acknowledge
 * every branch before TypeScript will let it build a response.
 *
 * Errors are string literal unions rather than Error subclasses: each
 * aggregate declares the small closed set it can fail with, and the route
 * maps those onto HTTP. Exceptions stay reserved for genuine bugs.
 */

export type Ok<T> = { readonly ok: true; readonly value: T };
export type Err<E extends string> = { readonly ok: false; readonly error: E };

export type Result<T, E extends string> = Ok<T> | Err<E>;

export function ok(): Ok<void>;
export function ok<T>(value: T): Ok<T>;
export function ok<T>(value?: T): Ok<T | undefined> {
  return { ok: true, value };
}

export function err<E extends string>(error: E): Err<E> {
  return { ok: false, error };
}
