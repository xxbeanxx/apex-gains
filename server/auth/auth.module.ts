import { Module } from '@nestjs/common';

import { oidcClientProvider } from './oidc-client.provider';
import { oidcStateCookieProvider } from './oidc-state-cookie.provider';
import { sessionStorageProvider } from './session-storage.provider';

@Module({
  exports: [oidcClientProvider, oidcStateCookieProvider, sessionStorageProvider],
  providers: [oidcClientProvider, oidcStateCookieProvider, sessionStorageProvider],
})
export class AuthModule {}
