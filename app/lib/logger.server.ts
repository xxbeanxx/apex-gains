import type { LoggerService } from '@nestjs/common';
import { createContext, type MiddlewareFunction, type RouterContextProvider } from 'react-router';

import { userContext } from '~/auth/user-context';

import { getNestLogger, nestLoggerContext } from './nest-bridge.server';

/** The Nest logger context label every request-lifecycle line is filed under. */
const REQUEST = 'Request';

/**
 * The logger for the current request, set by `requestLoggingMiddleware`.
 *
 * Defaults to null rather than being left unset: middleware only runs for a
 * *matched* route, so an unmatched URL reaches `entry.server.tsx`'s
 * `handleError` with nothing here - and `context.get` throws on an unset
 * context with no default, which would turn a plain 404 into a 500. Read it
 * through `requestLogger` below rather than directly.
 */
export const loggerContext = createContext<LoggerService | null>(null);

/**
 * The request's logger, falling back to the process-wide one on the paths
 * that have no request context to carry it.
 */
export function requestLogger(context: Readonly<RouterContextProvider>): LoggerService {
  return context.get(loggerContext) ?? getNestLogger();
}

/** "GET /today 200 in 12ms", plus the athlete once one is known. */
function describe(method: string, path: string, outcome: string, startedAt: number, userId: string | undefined): string {
  const durationMs = Math.round(performance.now() - startedAt);
  const who = userId ? ` for user ${userId}` : '';
  return `${method} ${path} ${outcome} in ${durationMs}ms${who}`;
}

export const requestLoggingMiddleware: MiddlewareFunction<Response> = async ({ request, context }, next) => {
  const logger = context.get(nestLoggerContext);
  context.set(loggerContext, logger);

  const { method } = request;
  const { pathname } = new URL(request.url);
  const startedAt = performance.now();

  try {
    const response = await next();
    logger.log(describe(method, pathname, String(response.status), startedAt, context.get(userContext)?.id), REQUEST);
    return response;
  } catch (err) {
    logger.error(
      describe(method, pathname, 'failed', startedAt, context.get(userContext)?.id),
      err instanceof Error ? err.stack : String(err),
      REQUEST,
    );
    throw err;
  }
};
