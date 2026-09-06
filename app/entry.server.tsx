import { PassThrough } from 'node:stream';

import type { ActionFunctionArgs, EntryContext, LoaderFunctionArgs, RouterContextProvider } from 'react-router';
import { createReadableStreamFromReadable } from '@react-router/node';
import { isRouteErrorResponse, ServerRouter } from 'react-router';
import { isbot } from 'isbot';
import type { RenderToPipeableStreamOptions } from 'react-dom/server';
import { renderToPipeableStream } from 'react-dom/server';

import { requestLogger } from '~/lib/logger';

export const streamTimeout = 5_000;

/** Nest logger context label for the lines this module emits. */
const REQUEST = 'Request';

export default function handleRequest(
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  routerContext: EntryContext,
  loadContext: RouterContextProvider,
) {
  // https://httpwg.org/specs/rfc9110.html#HEAD
  if (request.method.toUpperCase() === 'HEAD') {
    return new Response(null, {
      status: responseStatusCode,
      headers: responseHeaders,
    });
  }

  return new Promise((resolve, reject) => {
    let shellRendered = false;
    let userAgent = request.headers.get('user-agent');

    // Ensure requests from bots and SPA Mode renders wait for all content to load before responding
    // https://react.dev/reference/react-dom/server/renderToPipeableStream#waiting-for-all-content-to-load-for-crawlers-and-static-generation
    let readyOption: keyof RenderToPipeableStreamOptions =
      (userAgent && isbot(userAgent)) || routerContext.isSpaMode ? 'onAllReady' : 'onShellReady';

    // Abort the rendering stream after the `streamTimeout` so it has time to
    // flush down the rejected boundaries
    let timeoutId: ReturnType<typeof setTimeout> | undefined = setTimeout(() => abort(), streamTimeout + 1000);

    const { pipe, abort } = renderToPipeableStream(<ServerRouter context={routerContext} url={request.url} />, {
      [readyOption]() {
        shellRendered = true;
        const body = new PassThrough({
          final(callback) {
            // Clear the timeout to prevent retaining the closure and memory leak
            clearTimeout(timeoutId);
            timeoutId = undefined;
            callback();
          },
        });
        const stream = createReadableStreamFromReadable(body);

        responseHeaders.set('Content-Type', 'text/html');

        pipe(body);

        resolve(
          new Response(stream, {
            headers: responseHeaders,
            status: responseStatusCode,
          }),
        );
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
          requestLogger(loadContext).error(
            'streaming render error',
            error instanceof Error ? error.stack : String(error),
            REQUEST,
          );
        }
      },
    });
  });
}

type HandleErrorArgs = {
  request: LoaderFunctionArgs['request'] | ActionFunctionArgs['request'];
  context: LoaderFunctionArgs['context'] | ActionFunctionArgs['context'];
  params: LoaderFunctionArgs['params'] | ActionFunctionArgs['params'];
};

/**
 * Called by React Router for any loader/action/render error that isn't
 * purely control flow. A thrown `redirect()` or bare `data(..., { status })`
 * never reaches here; an `ErrorResponse` synthesized from a real Error does,
 * which includes the 404 for an unmatched URL - so this splits client faults
 * (4xx, logged as a warning) from ours (everything else, logged as an error).
 */
export function handleError(error: unknown, { request, context }: HandleErrorArgs) {
  if (request.signal.aborted) return;

  const logger = requestLogger(context);

  // A 4xx is the caller's mistake, not a fault of ours - an unmatched URL is
  // by far the most common, and bot traffic produces a steady stream of them.
  // Logging those at error level would bury real faults and make any
  // error-rate alert meaningless. The path is worth recording because an
  // unmatched URL never reached `requestLoggingMiddleware`, so this is the
  // only line that will mention it.
  if (isRouteErrorResponse(error) && error.status < 500) {
    const { pathname } = new URL(request.url);
    logger.warn(`${request.method} ${pathname} ${error.status}`, REQUEST);
    return;
  }

  // `ErrorResponseImpl.error` (the underlying thrown Error, when a Response
  // was synthesized from one) is private in react-router's public types, so
  // reach it structurally rather than through the nominal ErrorResponse type.
  const cause = isRouteErrorResponse(error) ? ((error as { error?: unknown }).error ?? error) : error;
  logger.error('unhandled server error', cause instanceof Error ? cause.stack : String(cause), REQUEST);
}
