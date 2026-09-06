import { Global, Module } from '@nestjs/common';

import { loggerProvider } from '~server/logging/logger.provider';

@Global()
@Module({
  providers: [loggerProvider],
  exports: [loggerProvider],
})
export class LoggingModule {}
