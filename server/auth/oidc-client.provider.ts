import type { Provider } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import * as client from 'openid-client';

import { googleOAuthConfig } from '../config/app.config';
import { OIDC_CLIENT_CONFIG } from './tokens';

/**
 * Discovery hits Google over the network, so it must stay lazy - deferred
 * until an auth route actually runs a login, not resolved eagerly during
 * Nest bootstrap, which would make every `npm run dev`/`start` depend on
 * reaching accounts.google.com even for someone only exercising the
 * in-memory adapters locally.
 *
 * The accessor itself is built synchronously and handed to the app via
 * `oidcConfigContext`; only `get()` performs the discovery call, once.
 */
export type OidcClientProvider = {
  get(): Promise<client.Configuration>;
};

export const oidcClientConfigProvider: Provider = {
  provide: OIDC_CLIENT_CONFIG,
  inject: [googleOAuthConfig.KEY],
  useFactory: (google: ConfigType<typeof googleOAuthConfig>): OidcClientProvider => {
    let configPromise: Promise<client.Configuration> | null = null;
    return {
      get(): Promise<client.Configuration> {
        if (!configPromise) {
          configPromise = client.discovery(
            new URL('https://accounts.google.com'),
            google.googleClientId,
            google.googleClientSecret,
          );
        }
        return configPromise;
      },
    };
  },
};
