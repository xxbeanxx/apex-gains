import { randomUUID } from "node:crypto";

import type { Logger } from "pino";
import {
  createContext,
  type MiddlewareFunction,
  type RouterContextProvider,
} from "react-router";

import { userContext } from "~/auth/user-context";

import { getNestLogger, nestLoggerContext } from "./nest-bridge.server";

/**
 * A per-request child logger with `requestId` bound, so every log line from a
 * single request can be correlated. Populated by `requestLoggingMiddleware`
 * below from the root pino instance Nest constructs - see
 * `server/logging/logger.provider.ts` and `app/lib/nest-bridge.server.ts`.
 *
 * Defaults to null rather than being left unset: middleware only runs for a
 * *matched* route, so an unmatched URL reaches `entry.server.tsx`'s
 * `handleError` with nothing here - and `context.get` throws on an unset
 * context with no default, which would turn a plain 404 into a 500. Read it
 * through `requestLogger` below rather than directly.
 */
export const loggerContext = createContext<Logger | null>(null);

/**
 * The request-scoped logger, falling back to the process-wide root logger on
 * the paths that have no request context to bind one to.
 */
export function requestLogger(
  context: Readonly<RouterContextProvider>,
): Logger {
  return context.get(loggerContext) ?? getNestLogger();
}

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
