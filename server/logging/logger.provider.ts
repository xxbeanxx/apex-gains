import { ConsoleLogger, LOG_LEVELS, type LogLevel } from '@nestjs/common';
import type { Provider } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';

import { coreConfig } from '../config/app.config';
import { LOGGER } from './tokens';

export type AppLogger = ConsoleLogger;

/**
 * `LOG_LEVELS` is ordered least to most severe, so everything from the
 * configured level onwards is what stays enabled - Nest takes the set of
 * levels to print, not a threshold.
 */
export function enabledLogLevels(minimum: LogLevel): LogLevel[] {
  return LOG_LEVELS.slice(LOG_LEVELS.indexOf(minimum));
}

/**
 * The one logger for the whole process. Nest's own internal logging goes
 * through it as well, via `app.useLogger()` in `server/main.ts`, and it
 * reaches the React Router app through `nestLoggerContext`.
 *
 * Colour is decided by whether anything can render it: writing ANSI escapes
 * into a redirected stream just makes the output harder to read.
 */
export const loggerProvider: Provider = {
  provide: LOGGER,
  inject: [coreConfig.KEY],
  useFactory: (core: ConfigType<typeof coreConfig>): AppLogger =>
    new ConsoleLogger({
      logLevels: enabledLogLevels(core.logLevel),
      colors: process.stdout.isTTY === true,
    }),
};
