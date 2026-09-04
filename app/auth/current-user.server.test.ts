import { RouterContextProvider } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

import type { Athlete } from '~/domain/athlete/athlete';
import type { AthleteService } from '~/services/athlete-service.server';
import { mock } from '~/test/mock';

import type { AppSessionStorage } from '~server/auth/session-storage.provider';
import { athleteServiceContext, sessionStorageContext } from '~/lib/nest-bridge.server';

import { loadUserMiddleware } from './current-user.server';
import { userContext } from './user-context';

type MiddlewareArgs = Parameters<typeof loadUserMiddleware>[0];

function sessionWithUserId(userId: string | undefined) {
  return { get: (name: string) => (name === 'userId' ? userId : undefined) };
}

function argsWithContext(
  byIdMock: ReturnType<typeof vi.fn>,
  getSessionMock: ReturnType<typeof vi.fn>,
): {
  args: MiddlewareArgs;
  context: RouterContextProvider;
} {
  const context = new RouterContextProvider();
  context.set(athleteServiceContext, mock<AthleteService>({ byId: byIdMock }));
  context.set(sessionStorageContext, mock<AppSessionStorage>({ getSession: getSessionMock }));

  const args = mock<MiddlewareArgs>({
    request: new Request('http://localhost/today', {
      headers: { Cookie: '__session=abc' },
    }),
    context,
  });
  return { args, context };
}

const noopNext = async () => undefined;

describe('loadUserMiddleware', () => {
  it('does not set a user when the session has no userId', async () => {
    const byIdMock = vi.fn();
    const getSessionMock = vi.fn().mockResolvedValue(sessionWithUserId(undefined));
    const { args, context } = argsWithContext(byIdMock, getSessionMock);

    await loadUserMiddleware(args, noopNext);

    expect(context.get(userContext)).toBeNull();
    expect(byIdMock).not.toHaveBeenCalled();
  });

  it("sets the athlete in context when the session's userId resolves to a row", async () => {
    const byIdMock = vi.fn();
    const getSessionMock = vi.fn().mockResolvedValue(sessionWithUserId('user-1'));
    const user = mock<Athlete>({ id: 'user-1', email: 'greg@example.com' });
    byIdMock.mockResolvedValue(user);
    const { args, context } = argsWithContext(byIdMock, getSessionMock);

    await loadUserMiddleware(args, noopNext);

    expect(byIdMock).toHaveBeenCalledWith('user-1');
    expect(context.get(userContext)).toBe(user);
  });

  it("does not set a user when the session's userId has no matching row", async () => {
    const byIdMock = vi.fn();
    const getSessionMock = vi.fn().mockResolvedValue(sessionWithUserId('stale-user'));
    byIdMock.mockResolvedValue(null);
    const { args, context } = argsWithContext(byIdMock, getSessionMock);

    await loadUserMiddleware(args, noopNext);

    expect(context.get(userContext)).toBeNull();
  });
});
