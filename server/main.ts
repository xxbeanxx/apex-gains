/**
 * HTTP entry point: bootstraps Nest, then serves the React Router app - Vite
 * in middleware mode for dev, the built output for production.
 *
 * Azure Container Apps terminates TLS at its ingress and forwards plain
 * HTTP, setting X-Forwarded-Proto/X-Forwarded-Host. Express's "trust proxy"
 * setting is what makes `req.protocol` (and therefore the `request.url`
 * React Router builds) correctly report "https". React Router's CSRF check
 * on document actions compares that origin against the browser's `Origin`
 * header, so without it every form submission would be rejected with a 400.
 */
import "reflect-metadata";

import path from "node:path";
import url from "node:url";

import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { createRequestHandler, type RequestHandler } from "@react-router/express";
import compression from "compression";
import { static as serveStatic } from "express";
import type { Express, NextFunction, Request, Response } from "express";
import { RouterContextProvider, type ServerBuild } from "react-router";

import { AppModule } from "./app.module";
import { coreConfig } from "./config/app.config";
import { NestPinoLogger } from "./logging/nest-logger.service";
import { LoadContextProvider } from "./react-router/load-context.provider";

const __filename = url.fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Load context arrives empty: `nestBridgeMiddleware` (registered first in
 * `app/root.tsx`) is what populates it - see `app/lib/nest-bridge.server.ts`.
 */
function makeRequestHandler(
  serverBuild: ServerBuild,
  mode: "development" | "production",
): RequestHandler {
  return createRequestHandler({
    build: serverBuild,
    mode,
    getLoadContext: () => new RouterContextProvider(),
  });
}

/** Registers Vite middleware and the SSR fallback for `npm run dev`. */
async function registerDevRoutes(server: Express): Promise<void> {
  const { createServer } = await import("vite");

  const vite = await createServer({
    appType: "custom",
    server: { middlewareMode: true },
  });

  server.use(vite.middlewares);

  server.use(async (req: Request, res: Response, next: NextFunction) => {
    try {
      const serverBuild = (await vite.ssrLoadModule(
        "virtual:react-router/server-build",
      )) as ServerBuild;

      return await makeRequestHandler(serverBuild, "development")(
        req,
        res,
        next,
      );
    } catch (error) {
      vite.ssrFixStacktrace(error as Error);
      next(error);
    }
  });
}

/** Serves the production build's static assets and the SSR fallback. */
async function registerProductionRoutes(server: Express): Promise<void> {
  const buildPath = path.resolve(__dirname, "../build/server/index.js");
  const build = (await import(url.pathToFileURL(buildPath).href)) as ServerBuild;

  const assetsBuildDirectory = path.resolve(build.assetsBuildDirectory);
  const publicPath = build.publicPath;

  server.use(
    path.posix.join(publicPath, "assets"),
    serveStatic(path.join(assetsBuildDirectory, "assets"), {
      immutable: true,
      maxAge: "1y",
    }),
  );
  server.use(publicPath, serveStatic(assetsBuildDirectory));
  server.use(serveStatic(path.resolve(__dirname, "../public"), { maxAge: "1h" }));
  // Production only: in dev, Vite serves `public/` itself. Nothing mounts
  // `/.well-known` in dev, so anything depending on it (assetlinks, apple-app-
  // site-association) can only be exercised against a production build.
  server.use(
    "/.well-known",
    serveStatic(path.join(assetsBuildDirectory, ".well-known")),
  );

  server.use(makeRequestHandler(build, "production"));
}

async function bootstrap() {
  // Holds logs emitted during module initialization until `useLogger` below
  // swaps in the real one, then flushes them through it.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
    // React Router owns request bodies: `request.formData()` reads the raw
    // stream, and Nest's parser middleware - registered during `init()`,
    // which runs before the React Router handler is mounted - would consume
    // it first and leave every form submission empty. A Nest controller that
    // needs a parsed body should opt in with `app.useBodyParser()`.
    bodyParser: false,
  });
  app.useLogger(app.get(NestPinoLogger));
  app.enableShutdownHooks();

  const adapter = app.getHttpAdapter();
  const server = adapter.getInstance() as Express;
  server.set("trust proxy", true);
  server.disable("x-powered-by");
  server.use(compression());

  // @react-router/express falls back to the raw `Host` header's port
  // whenever `X-Forwarded-Host` doesn't specify one (see createRemixRequest
  // in its source). Azure's ingress forwards an internal `Host` value that
  // doesn't necessarily match `X-Forwarded-Host`, so that fallback can still
  // produce a `request.url` with an unexpected port and trip the CSRF
  // origin check above. Normalize `Host` to the forwarded value so both
  // agree.
  server.use((req: Request, _res: Response, next: NextFunction) => {
    const forwardedHost = req.get("X-Forwarded-Host");
    if (forwardedHost) {
      req.headers.host = forwardedHost;
    }
    next();
  });

  const core = app.get(coreConfig.KEY);

  // Publishes every Nest-resolved singleton for `nestBridgeMiddleware` to
  // pick up - must happen before any request can reach a route.
  app.get(LoadContextProvider).register();

  // This app's fallback is the React Router handler, not Nest's 404. Nest
  // registers its own catch-all during `init()` and skips it when the adapter
  // exposes no `setNotFoundHandler` (the guard exists for adapters that
  // genuinely lack one), which is what removing the method here relies on.
  //
  // Suppressing it is what lets `init()` run *before* the fallback is mounted
  // below, and that ordering is the point: `init()` is where Nest mounts its
  // controllers, Express dispatches in registration order, and the React
  // Router handler matches every path and always responds. Registered the
  // other way round, any controller would be silently shadowed - serving the
  // SSR'd document instead of the route, with no error to diagnose.
  // Assigned, not deleted: the method lives on the adapter's prototype, so
  // `delete` on the instance would leave it reachable.
  (adapter as { setNotFoundHandler?: unknown }).setNotFoundHandler = undefined;

  await app.init();

  if (core.nodeEnv === "production") {
    await registerProductionRoutes(server);
  } else {
    await registerDevRoutes(server);
  }

  if (core.host) {
    await app.listen(core.port, core.host);
  } else {
    await app.listen(core.port);
  }

  Logger.log(`http://localhost:${core.port}`, "Bootstrap");
}

void bootstrap();
