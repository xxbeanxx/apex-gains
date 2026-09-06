import { Module } from '@nestjs/common';

import { googleIdentityProvider } from '~server/auth/google-identity.provider';
import { oidcStateCookieProvider } from '~server/auth/oidc-state-cookie.provider';
import { sessionStorageProvider } from '~server/auth/session-storage.provider';

@Module({
  exports: [googleIdentityProvider, oidcStateCookieProvider, sessionStorageProvider],
  providers: [googleIdentityProvider, oidcStateCookieProvider, sessionStorageProvider],
})
export class AuthModule {}
