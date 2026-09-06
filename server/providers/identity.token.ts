/**
 * DI token for the `GoogleIdentityProvider` port.
 *
 * Lives in the composition root rather than beside the port for the same
 * reason `persistence.tokens.ts` does: nothing in `src/application` is
 * Nest-aware, so `IdentityService` takes the port as a plain constructor
 * parameter, and binding the token to `GoogleIdentityAdapter` happens in
 * exactly one place - `server/auth/auth.module.ts`.
 */
export const GOOGLE_IDENTITY_PROVIDER = Symbol('GOOGLE_IDENTITY_PROVIDER');
