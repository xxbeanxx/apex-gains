import type { LoaderFunctionArgs } from 'react-router';
import { redirect } from 'react-router';

import { ErrorPage } from '~/components/error-page';

// No `default` export: this route only ever redirects. An ErrorBoundary
// export is still required so React Router renders errors through the
// normal styled document instead of treating this as a raw resource route
// (see `auth.test-login.tsx` for the same shape).
export { ErrorPage as ErrorBoundary };

const RENAMED_FIRST_SEGMENT: Record<string, string> = {
  routines: 'plans',
  templates: 'workouts',
  weight: 'body',
};

/**
 * Permanent redirects for links minted under the pre-rename `/routines`,
 * `/templates` and `/weight` paths - a routine already shared by link or QR
 * code has to keep resolving. Deliberately outside `_protected`: a
 * signed-out scanner needs to land on the surviving path before
 * `requireUserMiddleware` sends them to Google, so the OIDC state cookie
 * carries the destination that still exists rather than the one that was
 * renamed out from under it.
 */
export function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const segments = url.pathname.split('/');
  const renamed = RENAMED_FIRST_SEGMENT[segments[1]];
  if (renamed) segments[1] = renamed;
  url.pathname = segments.join('/');
  throw redirect(url.pathname + url.search, 301);
}
