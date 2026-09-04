/// <reference types="vitest/config" />

import { reactRouter } from '@react-router/dev/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

/**
 * Builds the React Router application. `vite.server.config.ts` builds the Nest
 * runtime that hosts it; the two land side by side in `build/server/`.
 */
export default defineConfig(({ command }) => ({
  plugins: [tailwindcss(), reactRouter()],
  resolve: {
    tsconfigPaths: true,
  },
  environments: {
    ssr: {
      resolve: {
        // Inline every dependency so the built server needs no `node_modules`
        // at runtime. Build only: in dev the SSR environment must keep loading
        // `react-router` from `node_modules`, the same copy `server/main.ts`
        // loads under tsx - two copies would fail `handleRequest`'s
        // `instanceof RouterContextProvider` check on every request.
        noExternal: command === 'build' ? true : undefined,
      },
      build: {
        // The React Router plugin defaults this to the virtual server build.
        // Pointing it at `handler.ts` puts the request handler - and the
        // `RouterContextProvider` it constructs - inside this bundle, where the
        // server build it serves also lives. The output is still
        // `build/server/index.js`: the plugin pins `entryFileNames` to the
        // configured `serverBuildFile` regardless of the input.
        rollupOptions: {
          input: './server/react-router/handler.ts',
        },
      },
    },
  },
  test: {
    environment: 'node',
    setupFiles: ['./vitest.setup.ts'],
    env: {
      // ~/db/index.server reads DATABASE_URL at import time (lazily, via a
      // Proxy - drizzle-orm/postgres-js never actually opens a connection
      // unless a test queries through it) - dummy values are safe. The rest
      // are no longer read directly by app code (server/config validates
      // them for the Nest bootstrap, which tests never go through), but stay
      // harmless to seed in case something still reads process.env.
      DATABASE_URL: 'postgres://test:test@localhost:5432/test',
      SESSION_SECRET: 'test-session-secret',
      GOOGLE_CLIENT_ID: 'test-google-client-id',
      GOOGLE_CLIENT_SECRET: 'test-google-client-secret',
    },
  },
}));
