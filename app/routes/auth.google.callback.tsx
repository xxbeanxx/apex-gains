import { redirect } from 'react-router';

import { clearOidcState, parseOidcState } from '~/auth/oidc-state';
import { safeRedirect } from '~/auth/safe-redirect';
import { ErrorPage } from '~/components/error-page';
import { requestLogger } from '~/lib/logger';

import {
  athleteServiceContext,
  identityServiceContext,
  oidcStateCookieContext,
  sessionStorageContext,
} from '~/router/load-context';

import type { Route } from './+types/auth.google.callback';

/** Nest logger context label for this route's lines. */
const AUTH = 'Auth';

// No `default` export: this route only ever redirects on success. An
// ErrorBoundary export is still required so React Router renders errors
// through the normal styled document instead of treating this as a raw
// resource route.
export { ErrorPage as ErrorBoundary };

export async function loader({ request, context }: Route.LoaderArgs) {
  const logger = requestLogger(context);
  const oidcStateCookie = context.get(oidcStateCookieContext);

  const state = await parseOidcState(oidcStateCookie, request.headers.get('Cookie'));
  if (!state) {
    logger.warn('oauth callback arrived with a missing or expired state cookie', AUTH);
    throw redirect('/auth/google');
  }

  // openid-client derives the redirect_uri it validates against Google from
  // this URL's origin (stripping query params), not from the redirect_uri
  // passed below - so it must match what's registered with Google. Trusting
  // request.url's origin here relies on server/main.ts's "trust proxy"
  // setting and Host-header normalization to report the externally-visible
  // scheme and host rather than Node's internal ones.
  const requestUrl = new URL(request.url);
  const origin = requestUrl.origin;

  const profile = await context.get(identityServiceContext).completeGoogleLogin({
    currentUrl: requestUrl,
    redirectUri: `${origin}/auth/google/callback`,
    codeVerifier: state.codeVerifier,
    nonce: state.nonce,
    state: state.state,
  });

  if (!profile) {
    logger.error('oauth callback did not return the expected profile claims (sub and email)', undefined, AUTH);
    throw new Response('Google did not return the expected profile claims', {
      status: 400,
    });
  }

  const { athlete, isNew } = await context.get(athleteServiceContext).signInWithGoogle(profile);

  logger.log(isNew ? `signed up user ${athlete.id}` : `logged in user ${athlete.id}`, AUTH);

  const sessionStorage = context.get(sessionStorageContext);
  const session = await sessionStorage.getSession(request.headers.get('Cookie'));
  session.set('userId', athlete.id);

  const headers = new Headers();
  headers.append('Set-Cookie', await sessionStorage.commitSession(session));
  headers.append('Set-Cookie', await clearOidcState(oidcStateCookie));

  return redirect(safeRedirect(state.redirectTo), { headers });
}
