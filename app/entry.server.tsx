import { PassThrough } from 'node:stream';

import { createReadableStreamFromReadable } from '@react-router/node';
import { isbot } from 'isbot';
import type { RenderToPipeableStreamOptions } from 'react-dom/server';
import { renderToPipeableStream } from 'react-dom/server';
import type { EntryContext, HandleErrorFunction, RouterContextProvider } from 'react-router';
import { ServerRouter, isRouteErrorResponse } from 'react-router';

import { requestLogger } from '~/lib/logger';

export const streamTimeout = 5_000;

export default function handleRequest(
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  routerContext: EntryContext,
  loadContext: RouterContextProvider,
) {
  //
  // https://httpwg.org/specs/rfc9110.html#HEAD
  //

  if (request.method.toUpperCase() === 'HEAD') {
    return new Response(null, { status: responseStatusCode, headers: responseHeaders });
  }

  return new Promise((resolve, reject) => {
    let shellRendered = false;
    let userAgent = request.headers.get('user-agent');

    // Ensure requests from bots and SPA Mode renders wait for all content to load before responding
    // https://react.dev/reference/react-dom/server/renderToPipeableStream#waiting-for-all-content-to-load-for-crawlers-and-static-generation

    let readyOption: keyof RenderToPipeableStreamOptions =
      (userAgent && isbot(userAgent)) || //
      routerContext.isSpaMode
        ? 'onAllReady'
        : 'onShellReady';

    // Abort the rendering stream after the `streamTimeout` so it has time to flush down the rejected boundaries

    let timeoutId: ReturnType<typeof setTimeout> | undefined = setTimeout(() => abort(), streamTimeout + 1000);

    const { pipe, abort } = renderToPipeableStream(<ServerRouter context={routerContext} url={request.url} />, {
      [readyOption]() {
        shellRendered = true;
        const body = new PassThrough({
          final(callback) {
            clearTimeout(timeoutId);
            timeoutId = undefined;
            callback();
          },
        });

        const stream = createReadableStreamFromReadable(body);

        responseHeaders.set('Content-Type', 'text/html');

        pipe(body);

        resolve(new Response(stream, { headers: responseHeaders, status: responseStatusCode }));
      },
      onShellError(error: unknown) {
        reject(error);
      },
      onError(error: unknown) {
        responseStatusCode = 500;
        // Log streaming rendering errors from inside the shell. Don't log
        // errors encountered during initial shell rendering since they'll
        // reject and get logged via handleError below.

        if (shellRendered) {
          const details = error instanceof Error ? error.stack : String(error);
          requestLogger(loadContext).error('streaming render error', details, 'Request');
        }
      },
    });
  });
}

/**
 * Called by React Router for any loader/action/render error that isn't
 * purely control flow. A thrown `redirect()` or bare `data(..., { status })`
 * never reaches here; an `ErrorResponse` synthesized from a real Error does,
 * which includes the 404 for an unmatched URL - so this splits client faults
 * (4xx, logged as a warning) from ours (everything else, logged as an error).
 */
export function handleError(error: unknown, { request, context }: Parameters<HandleErrorFunction>[1]) {
  if (request.signal.aborted) {
    return;
  }

  const logger = requestLogger(context);

  // A 4xx is the caller's mistake, not a fault of ours - an unmatched URL is
  // by far the most common, and bot traffic produces a steady stream of them.
  // Logging those at error level would bury real faults and make any
  // error-rate alert meaningless. The path is worth recording because an
  // unmatched URL never reached `requestLoggingMiddleware`, so this is the
  // only line that will mention it.
  if (isRouteErrorResponse(error) && error.status < 500) {
    const { pathname } = new URL(request.url);

    logger.warn(`${request.method} ${pathname} ${error.status}`, 'Request');
    return;
  }

  // `ErrorResponseImpl.error` (the underlying thrown Error, when a Response
  // was synthesized from one) is private in react-router's public types, so
  // reach it structurally rather than through the nominal ErrorResponse type.
  const cause = isRouteErrorResponse(error) ? ((error as { error?: unknown }).error ?? error) : error;
  logger.error('unhandled server error', cause instanceof Error ? cause.stack : String(cause), 'Request');
}
