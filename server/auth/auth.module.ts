import { Module } from '@nestjs/common';

import { googleIdentityProvider } from './google-identity.provider';
import { oidcStateCookieProvider } from './oidc-state-cookie.provider';
import { sessionStorageProvider } from './session-storage.provider';

@Module({
  exports: [googleIdentityProvider, oidcStateCookieProvider, sessionStorageProvider],
  providers: [googleIdentityProvider, oidcStateCookieProvider, sessionStorageProvider],
})
export class AuthModule {}
