/// <reference types="vitest/config" />

import { reactRouter } from '@react-router/dev/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import { configDefaults } from 'vitest/config';

/**
 * Builds the React Router application. `vite.server.config.ts` builds the Nest
 * runtime that hosts it; the two land side by side in `build/server/`.
 */
export default defineConfig(({ command }) => ({
  plugins: [tailwindcss(), reactRouter()],
  resolve: {
    tsconfigPaths: true,
  },
  optimizeDeps: {
    // Nest serves the app, so there is no `index.html` for Vite's dependency
    // scanner to crawl from and it would otherwise discover dependencies one
    // route at a time - re-bundling mid-session and reloading the page to
    // hand over the new URLs. Naming the real entry points gets that work
    // done at startup instead.
    entries: ['./app/root.tsx', './app/routes/**/*.tsx'],
  },
  environments: {
    ssr: {
      resolve: {
        // Build: inline every dependency so the built server needs no
        // `node_modules` at runtime.
        //
        // Dev: `@react-router/express` specifically has to be inlined.
        // `react-router` publishes `development` and `default` export
        // conditions, and Vite's dev SSR picks `development` where plain node
        // picks `default` - two module instances, two `RouterContextProvider`
        // classes. Everything on the request path (the express adapter, the
        // routes, and the load context `handler.ts` builds for them) has to
        // agree on one, or `handleRequest`'s `instanceof RouterContextProvider`
        // check rejects every request. Inlining pulls the adapter into Vite's
        // graph, where it resolves `react-router` the same way the routes do.
        noExternal: command === 'build' ? true : ['@react-router/express'],
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
    // Unit tests are `*.test.ts` beside the code they cover; `e2e/` holds
    // Playwright specs, which need a browser and a running server and are
    // configured separately in `playwright.config.ts`. Without this, vitest
    // collects them and fails on the `@playwright/test` import.
    exclude: [...configDefaults.exclude, 'e2e/**'],
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
    fsModuleCache: true,
    isolate: false,
  },
}));
