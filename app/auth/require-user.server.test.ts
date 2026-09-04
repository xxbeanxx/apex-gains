import { RouterContextProvider } from 'react-router';
import { describe, expect, it } from 'vitest';

import type { Athlete } from '~/domain/athlete/athlete';
import { mock } from '../../test/mock';

import { requireUserMiddleware } from './require-user.server';
import { userContext } from './user-context';

type MiddlewareArgs = Parameters<typeof requireUserMiddleware>[0];

function argsFor(url: string, user: Athlete | null): MiddlewareArgs {
  const context = new RouterContextProvider();
  if (user) context.set(userContext, user);
  return mock<MiddlewareArgs>({ request: new Request(url), context, params: {} });
}

const noopNext = async () => undefined;

describe('requireUserMiddleware', () => {
  it('does nothing when a user is present in context', async () => {
    const args = argsFor('http://localhost/today', mock<Athlete>({ id: 'user-1' }));

    const result = await requireUserMiddleware(args, noopNext);

    expect(result).toBeUndefined();
  });

  it('redirects to Google auth with a redirectTo when there is no user', async () => {
    const args = argsFor('http://localhost/today?tab=history', null);

    let thrown: unknown;
    try {
      await requireUserMiddleware(args, noopNext);
    } catch (error) {
      thrown = error;
    }

    if (!(thrown instanceof Response)) {
      throw new Error('expected requireUserMiddleware to throw a Response');
    }
    expect(thrown.status).toBe(302);
    expect(thrown.headers.get('Location')).toBe('/auth/google?redirectTo=%2Ftoday%3Ftab%3Dhistory');
  });

  it('redirects to just the pathname when there is no query string', async () => {
    const args = argsFor('http://localhost/routines', null);

    let thrown: unknown;
    try {
      await requireUserMiddleware(args, noopNext);
    } catch (error) {
      thrown = error;
    }

    if (!(thrown instanceof Response)) {
      throw new Error('expected requireUserMiddleware to throw a Response');
    }
    expect(thrown.headers.get('Location')).toBe('/auth/google?redirectTo=%2Froutines');
  });
});
