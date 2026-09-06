import type { Provider } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';

import type { GoogleIdentityProvider } from '~application/ports/identity/google-identity-provider';
import { GoogleIdentityAdapter } from '~infrastructure/identity/google/google-identity-adapter';

import { googleOAuthConfig } from '../config/google-oauth.config';
import { GOOGLE_IDENTITY_PROVIDER } from '../providers/identity.token';

/** Binds the `GoogleIdentityProvider` port to the Google/`openid-client` adapter. */
export const googleIdentityProvider: Provider = {
  inject: [googleOAuthConfig.KEY],
  provide: GOOGLE_IDENTITY_PROVIDER,
  useFactory: (google: ConfigType<typeof googleOAuthConfig>): GoogleIdentityProvider =>
    new GoogleIdentityAdapter(google.googleClientId, google.googleClientSecret),
};
