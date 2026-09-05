import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AuthModule } from './auth/auth.module';
import { coreConfig } from './config/core.config';
import { databaseConfig } from './config/database.config';
import { googleOAuthConfig } from './config/google-oauth.config';
import { sessionConfig } from './config/session.config';
import { testLoginConfig } from './config/test-login.config';
import { LoggingModule } from './logging/logging.module';
import { ServicesModule } from './services/services.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      // A `registerAs()` factory only becomes an injectable token once it is listed here,
      // so every slice a provider injects via `@Inject(xConfig.KEY)` has to appear in this array.
      load: [coreConfig, databaseConfig, googleOAuthConfig, sessionConfig, testLoginConfig],
    }),
    AuthModule,
    LoggingModule,
    ServicesModule,
  ],
})
export class AppModule {}
