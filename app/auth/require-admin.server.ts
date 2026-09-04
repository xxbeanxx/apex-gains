import type { MiddlewareFunction } from 'react-router';
import { data } from 'react-router';

import { userContext } from './user-context';

/**
 * Gate for the /admin area. Runs under the `_protected` layout, so an
 * anonymous request has already been redirected to sign in by
 * `requireUserMiddleware` and whoever reaches here is a known athlete.
 *
 * A signed-in athlete without the flag gets a 404 rather than a 403: the
 * rest of the app answers "not yours" the same way (see the `loadOwned*`
 * loaders), and an administered instance has no reason to confirm to an
 * ordinary account which URLs it is missing.
 */
export const requireAdminMiddleware: MiddlewareFunction<void | Response> = ({ context }) => {
  if (!context.get(userContext)?.isAdmin) {
    throw data('Page not found', { status: 404 });
  }
};
