/**
 * Entry point of the React Router SSR build, and the only module that touches
 * `react-router` at request time.
 *
 * `react-router` rejects a load context that is not an instance of *its own*
 * `RouterContextProvider` class (`instanceof`, not a duck-typed brand), and
 * `RouterContextProvider` keys its map by context-token identity. Both are
 * satisfied by assembling the handler here: this module is the SSR build's
 * entry, so the `react-router` and `~/router/load-context` it reaches are
 * the same copies the routes themselves use. `server/main.ts` - a separate
 * bundle in production, and plain `tsx` in dev - only supplies the values.
 */

import { createRequestHandler } from '@react-router/express';
import * as serverBuild from 'virtual:react-router/server-build';

import { nestLoadContext, type NestSingletons } from '~/router/load-context';

/**
 * Where the client build - hashed assets, plus anything from `public/` - was written.
 */
export const assetsBuildDirectory = serverBuild.assetsBuildDirectory;

/**
 * URL prefix the client build is served under.
 */
export const publicPath = serverBuild.publicPath;

export function createHandler(singletons: NestSingletons, mode: 'development' | 'production') {
  return createRequestHandler({
    build: serverBuild,
    mode: mode,
    getLoadContext: () => nestLoadContext(singletons),
  });
}
