import type { MiddlewareFunction, RouterContextProvider } from 'react-router';

import type { LoggerService } from '@nestjs/common';

import { userContext } from '~/auth/user-context';

import { nestLoggerContext } from '../router/load-context';

/** The Nest logger context label every request-lifecycle line is filed under. */
const REQUEST = 'Request';

/**
 * The logger for the current request. Safe on every path, matched route or
 * not: `nestLoadContext` populates `nestLoggerContext` when the load context
 * is built, before routing - unlike a middleware, which only runs once a
 * route has matched.
 */
export function requestLogger(context: Readonly<RouterContextProvider>): LoggerService {
  return context.get(nestLoggerContext);
}

/** "GET /today 200 in 12ms", plus the athlete once one is known. */
function describe(method: string, path: string, outcome: string, startedAt: number, userId: string | undefined): string {
  const durationMs = Math.round(performance.now() - startedAt);
  const who = userId ? ` for user ${userId}` : '';
  return `${method} ${path} ${outcome} in ${durationMs}ms${who}`;
}

export const requestLoggingMiddleware: MiddlewareFunction<Response> = async ({ request, context }, next) => {
  const logger = requestLogger(context);

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
