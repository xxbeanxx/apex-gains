import type { Provider } from "@nestjs/common";
import type { ConfigType } from "@nestjs/config";
import pino from "pino";

import { getBuildInfo } from "~/lib/build-info.server";

import { coreConfig } from "../config/app.config";
import { LOGGER } from "./tokens";

export type AppLogger = pino.Logger;

/**
 * The one pino instance for the whole process. Nest's own internal logs go
 * through it too (see `NestPinoLogger`, wired via `app.useLogger()` in
 * `server/main.ts`), and it's the root every per-request child logger
 * (`app/lib/logger.server.ts`'s `requestLoggingMiddleware`) is derived
 * from - reached via the same `registerNestSingletons`/load-context bridge
 * as every other Nest-resolved value (see `app/lib/nest-bridge.server.ts`).
 *
 * Structured JSON on stdout/stderr - Azure Container Apps ships those
 * straight into Log Analytics, so `pino-pretty` (readable, but not
 * JSON-parseable) is only worth it for a human watching `npm run dev`'s
 * terminal. Left as plain JSON for "test" too, so vitest runs don't spawn
 * pino-pretty's worker thread.
 */
export const loggerProvider: Provider = {
  provide: LOGGER,
  inject: [coreConfig.KEY],
  useFactory: (core: ConfigType<typeof coreConfig>): AppLogger =>
    pino({
      level: core.logLevel,
      base: { service: "apex-gains", build: getBuildInfo() },
      transport:
        core.nodeEnv === "development"
          ? { target: "pino-pretty", options: { colorize: true } }
          : undefined,
    }),
};
