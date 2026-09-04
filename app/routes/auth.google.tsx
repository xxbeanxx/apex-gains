import * as client from 'openid-client';
import { redirect } from 'react-router';

import { serializeOidcState } from '~/auth/oidc-state.server';
import { safeRedirect } from '~/auth/safe-redirect.server';
import { ErrorPage } from '~/components/error-page';

import { oidcConfigContext, oidcStateCookieContext } from '~/lib/nest-bridge.server';

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

  const codeVerifier = client.randomPKCECodeVerifier();
  const codeChallenge = await client.calculatePKCECodeChallenge(codeVerifier);
  const state = client.randomState();

  const url = new URL(request.url);
  const redirectTo = safeRedirect(url.searchParams.get('redirectTo'));

  const authorizationUrl = await context.get(oidcConfigContext).buildAuthorizationUrl({
    redirectUri: `${origin}/auth/google/callback`,
    codeChallenge,
    state,
  });

  return redirect(authorizationUrl.href, {
    headers: {
      'Set-Cookie': await serializeOidcState(context.get(oidcStateCookieContext), { codeVerifier, state, redirectTo }),
    },
  });
}
