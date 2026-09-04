/**
 * Entry point of the React Router SSR build, and the only module that touches
 * `react-router` at request time in production.
 *
 * `react-router` rejects a load context that is not an instance of *its own*
 * `RouterContextProvider` class (`instanceof`, not a duck-typed brand), so the
 * `getLoadContext` below has to be bundled alongside the server build it feeds.
 * That is why the request handler is assembled here and exported ready-made,
 * rather than in `server/main.ts`: the two are separate bundles, and a
 * `RouterContextProvider` minted in the other one would fail every request with
 * "Invalid `context` value provided to `handleRequest`".
 *
 * The context arrives empty: `nestBridgeMiddleware` (registered first in
 * `app/root.tsx`) is what populates it - see `app/lib/nest-bridge.server.ts`.
 */
import { createRequestHandler } from '@react-router/express';
import * as serverBuild from 'virtual:react-router/server-build';
import { RouterContextProvider } from 'react-router';

/** Where the client build - hashed assets, plus anything from `public/` - was written. */
export const assetsBuildDirectory = serverBuild.assetsBuildDirectory;

/** URL prefix the client build is served under. */
export const publicPath = serverBuild.publicPath;

export const requestHandler = createRequestHandler({
  build: serverBuild,
  mode: 'production',
  getLoadContext: () => new RouterContextProvider(),
});
