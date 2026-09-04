/**
 * The React Router server build is a virtual module: `@react-router/dev`'s
 * Vite plugin materializes it during the SSR build, so it only resolves from
 * inside that build - `handler.ts` (the SSR build's entry) is the one module
 * allowed to import it.
 */
declare module 'virtual:react-router/server-build' {
  import type { ServerBuild } from 'react-router';

  export const assets: ServerBuild['assets'];
  export const assetsBuildDirectory: ServerBuild['assetsBuildDirectory'];
  export const basename: ServerBuild['basename'];
  export const entry: ServerBuild['entry'];
  export const future: ServerBuild['future'];
  export const isSpaMode: ServerBuild['isSpaMode'];
  export const publicPath: ServerBuild['publicPath'];
  export const routes: ServerBuild['routes'];
  export const ssr: ServerBuild['ssr'];
}
