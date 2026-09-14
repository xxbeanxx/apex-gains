import { redirect } from 'react-router';
import { serializeOidcState } from '~web/auth/oidc-state';
import { safeRedirect } from '~web/auth/safe-redirect';
import { ErrorPage } from '~web/components/error-page';
import { identityServiceContext, oidcStateCookieContext } from '~web/router/load-context';

import type { Route } from './+types/auth.google';

// No `default` export: this route only ever redirects on success. An
// ErrorBoundary export is still required so React Router renders errors
// through the normal styled document instead of treating this as a raw
// resource route.
export { ErrorPage as ErrorBoundary };

export async function loader({ request, context }: Route.LoaderArgs) {
  // Relies on server/main.ts's "trust proxy" setting and Host-header
  // normalization to report the externally-visible scheme and host, not
  // Node's internal ones - this must match what's registered with Google
  // as the OAuth client's redirect URI.
  const origin = new URL(request.url).origin;

  const url = new URL(request.url);
  const redirectTo = safeRedirect(url.searchParams.get('redirectTo'));

  const { authorizationUrl, codeVerifier, nonce, state } = await context
    .get(identityServiceContext)
    .beginGoogleLogin(`${origin}/auth/google/callback`);

  return redirect(authorizationUrl.href, {
    headers: {
      'Set-Cookie': await serializeOidcState(context.get(oidcStateCookieContext), {
        codeVerifier: codeVerifier,
        nonce: nonce,
        state: state,
        redirectTo: redirectTo,
      }),
    },
  });
}
