import type { Provider } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import * as client from 'openid-client';

import { googleOAuthConfig } from '../config/google-oauth.config';
import { OIDC_CLIENT_CONFIG as OIDC_CLIENT } from './tokens';

/**
 * `server/main.ts` and every route both get their own bundled copy of
 * `openid-client` (see CLAUDE.md's "Build output"), so a `client.Configuration`
 * minted here would fail the library's own `instanceof` checks if a route
 * ever called `buildAuthorizationUrl`/`authorizationCodeGrant` on it
 * directly - it's checked against the route bundle's copy of the
 * `Configuration` class, not this one. Every call into `openid-client` stays
 * server-side here instead; only plain data (a `URL`, a claims object)
 * crosses to the route.
 *
 * Discovery hits Google over the network, so it must stay lazy - deferred
 * until an auth route actually runs a login, not resolved eagerly during
 * Nest bootstrap, which would make every `npm run dev`/`start` depend on
 * reaching accounts.google.com even for someone only exercising the
 * in-memory adapters locally.
 */
export type OidcClient = {
  authorizationCodeGrant(params: {
    currentUrl: URL; //
    redirectUri: string;
    pkceCodeVerifier: string;
    expectedNonce: string;
    expectedState: string;
  }): Promise<client.IDToken | undefined>;
  buildAuthorizationUrl(params: {
    redirectUri: string; //
    codeChallenge: string;
    nonce: string;
    state: string;
  }): Promise<URL>;
};

export const oidcClientProvider: Provider = {
  inject: [googleOAuthConfig.KEY],
  provide: OIDC_CLIENT,
  useFactory: (google: ConfigType<typeof googleOAuthConfig>): OidcClient => {
    let configPromise: Promise<client.Configuration> | null = null;

    const discover = (): Promise<client.Configuration> => {
      if (!configPromise) {
        configPromise = client
          .discovery(new URL('https://accounts.google.com'), google.googleClientId, google.googleClientSecret)
          .catch((error) => {
            // be sure not to "cache" any errors
            configPromise = null;
            throw error;
          });
      }

      return configPromise;
    };

    return {
      async buildAuthorizationUrl({ redirectUri, codeChallenge, nonce, state }): Promise<URL> {
        const config = await discover();

        return client.buildAuthorizationUrl(config, {
          redirect_uri: redirectUri,
          scope: 'openid email profile',
          code_challenge: codeChallenge,
          code_challenge_method: 'S256',
          nonce: nonce,
          state: state,
        });
      },
      async authorizationCodeGrant({
        currentUrl,
        redirectUri,
        pkceCodeVerifier,
        expectedNonce,
        expectedState,
      }): Promise<client.IDToken | undefined> {
        const config = await discover();
        const tokens = await client.authorizationCodeGrant(
          config,
          currentUrl,
          { expectedNonce: expectedNonce, expectedState: expectedState, pkceCodeVerifier: pkceCodeVerifier },
          { redirect_uri: redirectUri },
        );

        return tokens.claims();
      },
    };
  },
};
