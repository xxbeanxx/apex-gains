import { PassThrough } from "node:stream";

import type {
  ActionFunctionArgs,
  EntryContext,
  LoaderFunctionArgs,
  RouterContextProvider,
} from "react-router";
import { createReadableStreamFromReadable } from "@react-router/node";
import { isRouteErrorResponse, ServerRouter } from "react-router";
import { isbot } from "isbot";
import type { RenderToPipeableStreamOptions } from "react-dom/server";
import { renderToPipeableStream } from "react-dom/server";

import { logger, loggerContext } from "~/lib/logger.server";

export const streamTimeout = 5_000;

// Registered here (the server's actual bootstrap module) rather than in
// logger.server.ts, so importing the logger from a route/lib module never
// has the side effect of hooking process-wide crash handlers - that would
// also fire inside the vitest process for any file under test.
process.on("uncaughtException", (err) => {
  logger.fatal({ err }, "uncaught exception");
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  logger.error({ err: reason }, "unhandled rejection");
});

export default function handleRequest(
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  routerContext: EntryContext,
  loadContext: RouterContextProvider,
) {
  // https://httpwg.org/specs/rfc9110.html#HEAD
  if (request.method.toUpperCase() === "HEAD") {
    return new Response(null, {
      status: responseStatusCode,
      headers: responseHeaders,
    });
  }

  return new Promise((resolve, reject) => {
    let shellRendered = false;
    let userAgent = request.headers.get("user-agent");

    // Ensure requests from bots and SPA Mode renders wait for all content to load before responding
    // https://react.dev/reference/react-dom/server/renderToPipeableStream#waiting-for-all-content-to-load-for-crawlers-and-static-generation
    let readyOption: keyof RenderToPipeableStreamOptions =
      (userAgent && isbot(userAgent)) || routerContext.isSpaMode
        ? "onAllReady"
        : "onShellReady";

    // Abort the rendering stream after the `streamTimeout` so it has time to
    // flush down the rejected boundaries
    let timeoutId: ReturnType<typeof setTimeout> | undefined = setTimeout(
      () => abort(),
      streamTimeout + 1000,
    );

    const { pipe, abort } = renderToPipeableStream(
      <ServerRouter context={routerContext} url={request.url} />,
      {
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

          responseHeaders.set("Content-Type", "text/html");

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
            loadContext.get(loggerContext).error({ err: error }, "streaming render error");
          }
        },
      },
    );
  });
}

type HandleErrorArgs = {
  request: LoaderFunctionArgs["request"] | ActionFunctionArgs["request"];
  context: LoaderFunctionArgs["context"] | ActionFunctionArgs["context"];
  params: LoaderFunctionArgs["params"] | ActionFunctionArgs["params"];
};

/**
 * Called by React Router for any loader/action/render error that isn't a
 * plain thrown Response/`data()` used for control flow (redirects, 404s,
 * etc. never reach here - see the `!isRouteErrorResponse || err.error`
 * check in React Router's server runtime).
 */
export function handleError(error: unknown, { request, context }: HandleErrorArgs) {
  if (request.signal.aborted) return;

  // `ErrorResponseImpl.error` (the underlying thrown Error, when a Response
  // was synthesized from one) is private in react-router's public types, so
  // reach it structurally rather than through the nominal ErrorResponse type.
  const wrapped = isRouteErrorResponse(error)
    ? (error as { error?: unknown }).error
    : undefined;
  context.get(loggerContext).error({ err: wrapped ?? error }, "unhandled server error");
}
