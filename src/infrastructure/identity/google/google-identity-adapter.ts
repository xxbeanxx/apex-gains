import * as client from 'openid-client';

import type { NewAthlete } from '~domain/athlete/athlete';
import type {
  BeginGoogleLogin,
  CompleteGoogleLoginParams,
  GoogleIdentityProvider,
} from '~application/ports/identity/google-identity-provider';

/**
 * `server/main.ts` and every route each get their own bundled copy of
 * `openid-client` (see CLAUDE.md's "Build output"), so a `client.Configuration`
 * minted here would fail the library's own `instanceof` checks if a route's
 * copy of `buildAuthorizationUrl`/`authorizationCodeGrant` ever ran on it
 * directly. Every call into `openid-client` stays inside this adapter
 * instead; `GoogleIdentityProvider` callers only ever see plain data (a
 * `URL`, an athlete profile).
 *
 * Discovery hits Google over the network, so it stays lazy - deferred until
 * a login actually runs rather than resolved at Nest bootstrap, which would
 * make every `npm run dev`/`start` depend on reaching accounts.google.com
 * even for someone only exercising the in-memory adapters locally.
 */
export class GoogleIdentityAdapter implements GoogleIdentityProvider {
  private configPromise: Promise<client.Configuration> | null = null;

  constructor(
    private readonly clientId: string,
    private readonly clientSecret: string,
  ) {}

  private discover(): Promise<client.Configuration> {
    if (!this.configPromise) {
      this.configPromise = client
        .discovery(new URL('https://accounts.google.com'), this.clientId, this.clientSecret)
        .catch((error: unknown) => {
          // be sure not to "cache" any errors
          this.configPromise = null;
          throw error;
        });
    }

    return this.configPromise;
  }

  async beginLogin(redirectUri: string): Promise<BeginGoogleLogin> {
    const config = await this.discover();

    const codeVerifier = client.randomPKCECodeVerifier();
    const codeChallenge = await client.calculatePKCECodeChallenge(codeVerifier);
    const nonce = client.randomNonce();
    const state = client.randomState();

    const authorizationUrl = await client.buildAuthorizationUrl(config, {
      redirect_uri: redirectUri,
      scope: 'openid email profile',
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      nonce: nonce,
      state: state,
    });

    return { authorizationUrl, codeVerifier, nonce, state };
  }

  async completeLogin({
    currentUrl,
    redirectUri,
    codeVerifier,
    nonce,
    state,
  }: CompleteGoogleLoginParams): Promise<NewAthlete | null> {
    const config = await this.discover();

    const tokens = await client.authorizationCodeGrant(
      config,
      currentUrl,
      { expectedNonce: nonce, expectedState: state, pkceCodeVerifier: codeVerifier },
      { redirect_uri: redirectUri },
    );
    const claims = tokens.claims();

    if (!claims?.sub || typeof claims.email !== 'string') return null;

    return {
      googleSub: claims.sub,
      email: claims.email,
      name: typeof claims.name === 'string' ? claims.name : claims.email,
      avatarUrl: typeof claims.picture === 'string' ? claims.picture : null,
    };
  }
}
