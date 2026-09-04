import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";

import {
  appConfig,
  coreConfig,
  databaseConfig,
  googleOAuthConfig,
  sessionConfig,
  testLoginConfig,
} from "./config/app.config";
import { ReactRouterModule } from "./react-router/react-router.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      // Every slice a provider injects via `@Inject(xConfig.KEY)` has to be
      // listed here, not just the merged `appConfig` - each `registerAs()`
      // factory only becomes an injectable token when it's in this array.
      load: [
        appConfig,
        coreConfig,
        databaseConfig,
        googleOAuthConfig,
        sessionConfig,
        testLoginConfig,
      ],
    }),
    ReactRouterModule,
  ],
})
export class AppModule {}
