/**
 * Confines a post-login redirect to this application.
 *
 * `redirectTo` reaches the auth routes as a query parameter, so a crafted
 * link (`/auth/google?redirectTo=https://evil.com`) would otherwise send the
 * athlete off-site on the back of a genuine, successful login - the phishing
 * value being that the redirect happens *after* real credentials were
 * accepted. Signing it into the state cookie stops tampering, not this.
 *
 * Only a single-slash absolute path is allowed. `//host` is rejected because
 * a browser reads it as a protocol-relative URL pointing at another origin,
 * and anything with a scheme is rejected outright.
 */
export const DEFAULT_REDIRECT = "/today";

export function safeRedirect(
  redirectTo: string | null | undefined,
  fallback: string = DEFAULT_REDIRECT,
): string {
  if (!redirectTo || !redirectTo.startsWith("/")) return fallback;
  if (redirectTo.startsWith("//")) return fallback;
  // A backslash is normalized to a forward slash by some browsers, so `/\host`
  // is another way of writing `//host`.
  if (redirectTo.startsWith("/\\")) return fallback;
  return redirectTo;
}
