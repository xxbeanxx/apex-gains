import { Inject, Injectable, type LoggerService } from "@nestjs/common";

import type { AppLogger } from "./logger.provider";
import { LOGGER } from "./tokens";

/**
 * Adapts the shared pino instance to Nest's `LoggerService` interface, so
 * `app.useLogger()` (see `server/main.ts`) routes Nest's own internal
 * bootstrap logging (`[NestFactory]`, `[InstanceLoader]`, ...) through the
 * same structured JSON logger the rest of the app uses, instead of Nest's
 * default colorized console output.
 *
 * Nest's `LoggerService` methods take a free-form `message` plus trailing
 * `optionalParams` (conventionally a `context` label, e.g. "Bootstrap") -
 * that's a different calling convention than pino's own
 * `logger.info(mergingObject, msg)`, so this only exists to satisfy Nest's
 * interface. Everything else in the app (routes, services, the per-request
 * `requestLoggingMiddleware`) keeps using the pino API directly via
 * `loggerContext`, since Nest's interface has no equivalent to a pino child
 * logger with bound structured fields.
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
