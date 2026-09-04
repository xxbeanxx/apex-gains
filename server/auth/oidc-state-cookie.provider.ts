import type { Provider } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { createCookie, type Cookie } from 'react-router';

import { coreConfig } from '../config/core.config';
import { sessionConfig } from '../config/session.config';
import { OIDC_STATE_COOKIE } from './tokens';

/**
 * The short-lived PKCE/state cookie, used only across the Google OIDC
 * redirect round-trip. `app/auth/oidc-state.server.ts` holds the
 * serialize/parse logic; this is just the configured cookie.
 */
export const oidcStateCookieProvider: Provider = {
  provide: OIDC_STATE_COOKIE,
  inject: [sessionConfig.KEY, coreConfig.KEY],
  useFactory: (session: ConfigType<typeof sessionConfig>, core: ConfigType<typeof coreConfig>): Cookie =>
    createCookie('__oidc_state', {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: core.nodeEnv === 'production',
      maxAge: 60 * 10,
      secrets: [session.sessionSecret],
    }),
};
