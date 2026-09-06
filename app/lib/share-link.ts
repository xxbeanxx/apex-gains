/**
 * Where a share token lives on the web.
 *
 * Both ends need to agree: the plan page builds the URL to hand out, and
 * `plans.import.$shareToken` is what the link resolves to. Stating the
 * path once is what keeps a QR code already printed on someone's phone
 * pointing at a route that still exists.
 */
export function sharePathFor(shareToken: string): string {
  return `/plans/import/${shareToken}`;
}

/**
 * The absolute link to put in a QR code.
 *
 * The origin comes from the request rather than from an env var, which works
 * because `server/main.ts` trusts the proxy and normalizes `X-Forwarded-Host`
 * onto `Host` - the same two pieces the OIDC `redirect_uri` relies on. A QR
 * code has to carry an absolute URL, so getting this wrong sends a scanner
 * to the container's internal hostname.
 */
export function shareUrlFor(request: Request, shareToken: string): string {
  return new URL(sharePathFor(shareToken), new URL(request.url).origin).href;
}
