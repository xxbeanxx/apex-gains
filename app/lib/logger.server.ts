import { randomUUID } from "node:crypto";

import pino from "pino";
import { createContext, type MiddlewareFunction } from "react-router";

import { userContext } from "~/auth/user-context";

import { getBuildInfo } from "./build-info.server";

/**
 * Structured JSON logs on stdout/stderr - Azure Container Apps ships those
 * straight into Log Analytics, so `pino-pretty` (readable, but not
 * JSON-parseable) is only worth it for a human watching `npm run dev`'s
 * terminal. Left as plain JSON for "test" too, so vitest runs don't spawn
 * pino-pretty's worker thread.
 */
export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  base: { service: "apex-gains", build: getBuildInfo() },
  transport:
    process.env.NODE_ENV === "development"
      ? { target: "pino-pretty", options: { colorize: true } }
      : undefined,
});

/**
 * A per-request child logger with `requestId` bound, so every log line from
 * a single request (route logs included, via `context.get(loggerContext)`)
 * can be correlated. Populated by `requestLoggingMiddleware` in root.tsx;
 * the default is only hit if that middleware is ever skipped.
 */
export const loggerContext = createContext(logger);

export const requestLoggingMiddleware: MiddlewareFunction<Response> = async (
  { request, context },
  next,
) => {
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
