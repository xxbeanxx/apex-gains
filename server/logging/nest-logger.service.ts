import { Inject, Injectable, type LoggerService } from "@nestjs/common";

import type { AppLogger } from "./logger.provider";
import { LOGGER } from "./tokens";

/**
 * Adapts the shared pino instance to Nest's `LoggerService`, so Nest's own
 * bootstrap logging (`[NestFactory]`, `[InstanceLoader]`, ...) lands in the
 * same structured JSON as everything else rather than Nest's colorized
 * console output.
 *
 * Only Nest uses this shim. App code logs through `loggerContext` with
 * pino's own API, which this interface has no equivalent for - there is no
 * way to express a child logger with bound structured fields here.
 */
@Injectable()
export class NestPinoLogger implements LoggerService {
  constructor(@Inject(LOGGER) private readonly logger: AppLogger) {}

  log(message: unknown, ...optionalParams: unknown[]): void {
    this.logger.info(fields(optionalParams), String(message));
  }

  error(message: unknown, ...optionalParams: unknown[]): void {
    this.logger.error(fields(optionalParams), String(message));
  }

  warn(message: unknown, ...optionalParams: unknown[]): void {
    this.logger.warn(fields(optionalParams), String(message));
  }

  debug(message: unknown, ...optionalParams: unknown[]): void {
    this.logger.debug(fields(optionalParams), String(message));
  }

  verbose(message: unknown, ...optionalParams: unknown[]): void {
    this.logger.trace(fields(optionalParams), String(message));
  }

  fatal(message: unknown, ...optionalParams: unknown[]): void {
    this.logger.fatal(fields(optionalParams), String(message));
  }
}

/** Nest's last optional param is conventionally a string `context` label. */
function fields(optionalParams: unknown[]): Record<string, unknown> {
  const context = optionalParams.at(-1);
  return typeof context === "string" ? { context } : {};
}
