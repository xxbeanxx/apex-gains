import { Global, Module } from "@nestjs/common";

import { loggerProvider } from "./logger.provider";
import { NestPinoLogger } from "./nest-logger.service";

@Global()
@Module({
  providers: [loggerProvider, NestPinoLogger],
  exports: [loggerProvider, NestPinoLogger],
})
export class LoggingModule {}
