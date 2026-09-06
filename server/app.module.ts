import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AuthModule } from '~server/auth/auth.module';
import { coreConfig } from '~server/config/core.config';
import { databaseConfig } from '~server/config/database.config';
import { googleOAuthConfig } from '~server/config/google-oauth.config';
import { sessionConfig } from '~server/config/session.config';
import { testLoginConfig } from '~server/config/test-login.config';
import { LoggingModule } from '~server/logging/logging.module';
import { ServicesModule } from '~server/services/services.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      // A `registerAs()` factory only becomes an injectable token once it is listed here,
      // so every slice a provider names in its `inject` array has to appear in this array.
      load: [coreConfig, databaseConfig, googleOAuthConfig, sessionConfig, testLoginConfig],
    }),
    AuthModule,
    LoggingModule,
    ServicesModule,
  ],
})
export class AppModule {}
