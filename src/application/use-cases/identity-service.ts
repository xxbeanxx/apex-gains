import type { NewAthlete } from '~domain/athlete/athlete';
import type {
  BeginGoogleLogin,
  CompleteGoogleLoginParams,
  GoogleIdentityProvider,
} from '~application/ports/identity/google-identity-provider';

/**
 * Google sign-in, kept separate from `AthleteService`: this is the identity
 * concern (proving who is asking), not the registration/sign-in one (what
 * happens once they're proven). `app/routes/auth.google.callback.tsx` calls
 * both - this to validate the OIDC round trip and get a profile, then
 * `AthleteService.signInWithGoogle` to find or register the athlete it names.
 */
export class IdentityService {
  constructor(private readonly google: GoogleIdentityProvider) {}

  async beginGoogleLogin(redirectUri: string): Promise<BeginGoogleLogin> {
    return this.google.beginLogin(redirectUri);
  }

  async completeGoogleLogin(params: CompleteGoogleLoginParams): Promise<NewAthlete | null> {
    return this.google.completeLogin(params);
  }
}
