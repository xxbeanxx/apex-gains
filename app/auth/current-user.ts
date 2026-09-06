import type { MiddlewareFunction } from 'react-router';

import { userContext } from '~/auth/user-context';
import { athleteServiceContext, sessionStorageContext } from '~/router/load-context';

export const loadUserMiddleware: MiddlewareFunction<void | Response> = async ({ request, context }) => {
  const sessionStorage = context.get(sessionStorageContext);
  const session = await sessionStorage.getSession(request.headers.get('Cookie'));
  const userId = session.get('userId');

  if (!userId) {
    return;
  }

  const athlete = await context.get(athleteServiceContext).byId(userId);

  if (athlete) {
    context.set(userContext, athlete);
  }
};
