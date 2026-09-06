import { redirect } from 'react-router';

import { safeRedirect } from '~/auth/safe-redirect';
import { ErrorPage } from '~/components/error-page';
import { requestLogger } from '~/lib/logger';

import { athleteServiceContext, sessionStorageContext, testLoginConfigContext } from '~/router/load-context';

import type { Route } from './+types/auth.test-login';

// No `default` export: this route only ever redirects on success. An
// ErrorBoundary export is still required so React Router renders errors
// through the normal styled document instead of treating this as a raw
// resource route (see the loader below).
export { ErrorPage as ErrorBoundary };

// Test-only stand-in for the Google OAuth flow: e2e suites (Playwright)
// can't drive Google's real consent screen, so this signs a request in
// directly by email, creating the user on first use exactly like the real
// callback does. Gated on ENABLE_TEST_LOGIN so it 404s unless explicitly
// turned on - that flag must never be set on the deployed app.
export async function loader({ request, context }: Route.LoaderArgs) {
  if (!context.get(testLoginConfigContext).enableTestLogin) {
    throw new Response('Not Found', { status: 404 });
  }

  const logger = requestLogger(context);
  const url = new URL(request.url);
  const email = url.searchParams.get('email');
  if (!email) {
    throw new Response("Missing required 'email' query parameter", {
      status: 400,
    });
  }
  const name = url.searchParams.get('name') ?? email;
  const redirectTo = safeRedirect(url.searchParams.get('redirectTo'));
  // Only honoured for an email being seen for the first time, and only
  // behind the same flag as the rest of this route: it is how an /admin spec
  // gets an administrator to sign in as.
  const asAdministrator = url.searchParams.get('admin') === 'true';

  const { athlete, isNew } = await context.get(athleteServiceContext).signInWithEmail(
    {
      googleSub: `test-login:${email}`,
      email,
      name,
      avatarUrl: null,
    },
    { asAdministrator },
  );

  logger.log(`test login as ${isNew ? 'new' : 'existing'} user ${athlete.id}`, 'Auth');

  const sessionStorage = context.get(sessionStorageContext);
  const session = await sessionStorage.getSession(request.headers.get('Cookie'));
  session.set('userId', athlete.id);

  return redirect(redirectTo, {
    headers: { 'Set-Cookie': await sessionStorage.commitSession(session) },
  });
}
