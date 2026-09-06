import { redirect } from 'react-router';

import { userContext } from '~/auth/user-context';
import { ErrorPage } from '~/components/error-page';
import { requestLogger } from '~/lib/logger';

import { sessionStorageContext } from '~/router/load-context';

import type { Route } from './+types/auth.logout';

// No `default` export: this route only ever redirects on success. An
// ErrorBoundary export is still required so React Router renders errors
// through the normal styled document instead of treating this as a raw
// resource route.
export { ErrorPage as ErrorBoundary };

export async function action({ request, context }: Route.ActionArgs) {
  const user = context.get(userContext);
  if (user) {
    requestLogger(context).log(`user ${user.id} logged out`, 'Auth');
  }

  const sessionStorage = context.get(sessionStorageContext);
  const session = await sessionStorage.getSession(request.headers.get('Cookie'));
  return redirect('/', {
    headers: {
      'Set-Cookie': await sessionStorage.destroySession(session),
    },
  });
}
