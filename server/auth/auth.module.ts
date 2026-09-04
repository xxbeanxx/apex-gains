import { Module } from '@nestjs/common';

import { oidcClientConfigProvider } from './oidc-client.provider';
import { oidcStateCookieProvider } from './oidc-state-cookie.provider';
import { sessionStorageProvider } from './session-storage.provider';

const providers = [sessionStorageProvider, oidcClientConfigProvider, oidcStateCookieProvider];

@Module({
  providers,
  exports: providers,
})
export class AuthModule {}
