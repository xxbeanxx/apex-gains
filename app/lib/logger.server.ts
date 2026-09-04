import { randomUUID } from "node:crypto";

import type { Logger } from "pino";
import { createContext, type MiddlewareFunction } from "react-router";

import { userContext } from "~/auth/user-context";

import { nestLoggerContext } from "./nest-bridge.server";

/**
 * A per-request child logger with `requestId` bound, so every log line from
 * a single request (route logs included, via `context.get(loggerContext)`)
 * can be correlated. Populated by `requestLoggingMiddleware` below, from the
 * root pino instance Nest constructs and validates - see
 * `server/logging/logger.provider.ts` and `app/lib/nest-bridge.server.ts`.
 *
 * No default value: `nestBridgeMiddleware` (which this middleware depends
 * on running after) already throws a clear error if Nest's singletons were
 * never registered, so there's no meaningful fallback logger to construct
 * here - unlike the repository/service contexts, this one just never gets
 * skipped in practice.
 */
export const loggerContext = createContext<Logger>();

export const requestLoggingMiddleware: MiddlewareFunction<Response> = async (
  { request, context },
  next,
) => {
  const logger = context.get(nestLoggerContext);
  const requestLogger = logger.child({ requestId: randomUUID() });
  context.set(loggerContext, requestLogger);

  const { method } = request;
  const { pathname } = new URL(request.url);
  const start = performance.now();

  try {
    const response = await next();
    requestLogger.info(
      {
        method,
        path: pathname,
        status: response.status,
        durationMs: Math.round(performance.now() - start),
        userId: context.get(userContext)?.id,
      },
      "request completed",
    );
    return response;
  } catch (err) {
    requestLogger.error(
      {
        err,
        method,
        path: pathname,
        durationMs: Math.round(performance.now() - start),
        userId: context.get(userContext)?.id,
      },
      "request failed",
    );
    throw err;
  }
};
