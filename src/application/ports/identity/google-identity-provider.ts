import type { NewAthlete } from '~domain/athlete/athlete';

/** What starting a login hands back: where to send the browser, and what the state cookie must carry through the round trip. */
export type BeginGoogleLogin = {
  readonly authorizationUrl: URL;
  readonly codeVerifier: string;
  readonly nonce: string;
  readonly state: string;
};

/** The callback request's URL plus the state cookie's contents, matched back up. */
export type CompleteGoogleLoginParams = {
  readonly currentUrl: URL;
  readonly redirectUri: string;
  readonly codeVerifier: string;
  readonly nonce: string;
  readonly state: string;
};

/**
 * Port: `IdentityService` depends on this interface, not on `openid-client`
 * directly - `server/auth/` is the one place that picks Google's OIDC
 * endpoints as the implementation.
 *
 * `completeLogin` returns `null` rather than throwing when Google's claims
 * don't carry what an athlete needs (`sub` and `email`), since a malformed
 * response is data for the caller to reject, not a bug in this adapter.
 */
export interface GoogleIdentityProvider {
  beginLogin(redirectUri: string): Promise<BeginGoogleLogin>;
  completeLogin(params: CompleteGoogleLoginParams): Promise<NewAthlete | null>;
}
