/**
 * HTTP entry point: bootstraps Nest, then serves the React Router app - Vite
 * in middleware mode for dev, the built output for production. `tsx` runs this
 * file as source in dev; in production it is `build/server/main.js`, bundled by
 * `vite.server.config.ts` with its dependencies inlined.
 *
 * Azure Container Apps terminates TLS at its ingress and forwards plain
 * HTTP, setting X-Forwarded-Proto/X-Forwarded-Host. Express's "trust proxy"
 * setting is what makes `req.protocol` (and therefore the `request.url`
 * React Router builds) correctly report "https". React Router's CSRF check
 * on document actions compares that origin against the browser's `Origin`
 * header, so without it every form submission would be rejected with a 400.
 */

import 'reflect-metadata';

import path from 'node:path';
import url from 'node:url';

import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import compression from 'compression';
import { static as serveStatic } from 'express';
import type { Express, NextFunction, Request, Response } from 'express';

import type { NestSingletons } from '~/lib/nest-bridge.server';

import { AppModule } from './app.module';
import { coreConfig } from './config/core.config';
import { LOGGER } from './logging/tokens';
import { collectNestSingletons } from './react-router/singletons';

const __filename = url.fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Registers Vite middleware and the SSR fallback for `npm run dev`.
 *
 * `handler.ts` is loaded *through Vite* rather than imported: it has to come
 * from the same module graph as the routes, and it is re-loaded per request
 * so an edit to a route or to the handler itself takes effect without a
 * restart. Vite itself is imported dynamically so it stays out of the
 * production bundle.
 */
async function registerDevRoutes(server: Express, singletons: NestSingletons): Promise<void> {
  const { createServer } = await import('vite');

  const vite = await createServer({
    appType: 'custom',
    server: { middlewareMode: true },
  });

  server.use(vite.middlewares);

  server.use(async (req, res, next) => {
    try {
      const { createHandler } = (await vite.ssrLoadModule(
        '/server/react-router/handler.ts',
      )) as typeof import('./react-router/handler');

      const requestHandler = createHandler(singletons, 'development');

      return await requestHandler(req, res, next);
    } catch (error) {
      if (error instanceof Error) {
        vite.ssrFixStacktrace(error);
      }

      next(error);
    }
  });
}

/**
 * Serves the production build's static assets and the SSR fallback.
 *
 * `index.js` - the React Router bundle, built from `handler.ts` - sits next
 * to this file in `build/server/`. The import goes through a computed path so
 * no bundler tries to follow it: the module only exists once
 * `react-router build` has run.
 */
async function registerProductionRoutes(server: Express, singletons: NestSingletons): Promise<void> {
  const handlerPath = path.resolve(__dirname, 'index.js');

  const { assetsBuildDirectory, publicPath, createHandler } = (await import(
    url.pathToFileURL(handlerPath).href
  )) as typeof import('./react-router/handler');

  const assetsDirectory = path.resolve(assetsBuildDirectory);

  server.use(
    path.posix.join(publicPath, 'assets'),
    serveStatic(path.join(assetsDirectory, 'assets'), {
      immutable: true,
      maxAge: '1y',
    }),
  );

  // The client build directory holds `public/`'s contents too - Vite copies
  // them there - so this one mount covers both.
  server.use(publicPath, serveStatic(assetsDirectory));

  // Production only: in dev, Vite serves `public/` itself. Nothing mounts `/.well-known`
  // in dev, so anything depending on it (assetlinks, apple-app-site-association)
  // can only be exercised against a production build.
  server.use('/.well-known', serveStatic(path.join(assetsDirectory, '.well-known')));

  server.use(createHandler(singletons, 'production'));
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

  const logger = app.get(LOGGER);

  app.useLogger(logger);
  app.enableShutdownHooks();

  // The process is the server, so its crash handlers belong here rather than
  // anywhere under `app/`, where importing the module would hook them inside
  // the vitest process too.
  process.on('uncaughtException', (err) => {
    logger.fatal('uncaught exception', err.stack, 'Process');
    process.exit(1);
  });

  // Since Node.js 15+, unhandled Promise rejections crash the process by default.
  // We honor that behavior here by shutting down the process after logging.
  process.on('unhandledRejection', (reason) => {
    logger.error('unhandled rejection', reason instanceof Error ? reason.stack : String(reason), 'Process');
    process.exit(1);
  });

  const adapter = app.getHttpAdapter();
  const server = adapter.getInstance();

  server.set('trust proxy', true);
  server.disable('x-powered-by');
  server.use(compression());

  // @react-router/express falls back to the raw `Host` header's port
  // whenever `X-Forwarded-Host` doesn't specify one (see createRemixRequest
  // in its source). Azure's ingress forwards an internal `Host` value that
  // doesn't necessarily match `X-Forwarded-Host`, so that fallback can still
  // produce a `request.url` with an unexpected port and trip the CSRF
  // origin check above. Normalize `Host` to the forwarded value so both agree.

  server.use((req, _res, next) => {
    const forwardedHost = req.get('X-Forwarded-Host');

    if (forwardedHost) {
      req.headers.host = forwardedHost;
    }

    next();
  });

  const core = app.get(coreConfig.KEY);
  const singletons = collectNestSingletons(app);

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
  adapter.setNotFoundHandler = undefined;

  await app.init();

  if (core.nodeEnv === 'production') {
    await registerProductionRoutes(server, singletons);
  } else {
    await registerDevRoutes(server, singletons);
  }

  if (core.host) {
    await app.listen(core.port, core.host);
  } else {
    await app.listen(core.port);
  }

  Logger.log(`http://localhost:${core.port}`, 'Bootstrap');
}

void bootstrap();
