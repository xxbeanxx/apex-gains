import { type SessionStorage, createCookieSessionStorage } from 'react-router';

import type { Provider } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';

import { coreConfig } from '../config/core.config';
import { sessionConfig } from '../config/session.config';
import { SESSION_STORAGE } from './tokens';

export type SessionData = {
  userId: string;
};

export type AppSessionStorage = SessionStorage<SessionData>;

/**
 * The signed cookie session, reached by the app via `sessionStorageContext`.
 */
export const sessionStorageProvider: Provider = {
  provide: SESSION_STORAGE,
  inject: [sessionConfig.KEY, coreConfig.KEY],
  useFactory: (session: ConfigType<typeof sessionConfig>, core: ConfigType<typeof coreConfig>): AppSessionStorage =>
    createCookieSessionStorage<SessionData>({
      cookie: {
        name: '__session',
        httpOnly: true,
        sameSite: 'lax',
        secure: core.nodeEnv === 'production',
        path: '/',
        maxAge: 60 * 60 * 24 * 30,
        secrets: [session.sessionSecret],
      },
    }),
};
