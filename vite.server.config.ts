import { defineConfig } from 'vite';

/**
 * Builds the Nest server runtime - `server/main.ts` and everything it reaches,
 * dependencies included - into `build/server/main.js`, so the production image
 * ships `build/` and nothing else. `vite.config.ts` builds the React Router
 * application it hosts.
 *
 * The two bundles meet at `build/server/index.js`, which `main.ts` imports at
 * runtime by path: `react-router` ends up in both, and only the copy inside the
 * React Router bundle may serve a request (see `react-router/handler.ts`).
 */
export default defineConfig({
  build: {
    // The server runtime serves `public/` out of the client build, and the
    // React Router build has already copied it there.
    copyPublicDir: false,

    // `react-router build` writes `build/client` and `build/server/index.js`
    // first; clearing the directory here would take them with it.
    emptyOutDir: false,

    outDir: './build/server/',

    rollupOptions: {
      input: './server/main.ts',
      output: {
        entryFileNames: '[name].js',
        // Nest loads `@nestjs/platform-express` through a dynamic import, so
        // the bundle is split whether or not this build asks for it. Naming
        // the directory keeps those chunks from sitting between the two
        // entry points this directory is really about, `main.js` and the
        // React Router build's `index.js`.
        chunkFileNames: 'chunks/[name]-[hash].js',
      },
      // Vite is a dev-only dependency, loaded through a dynamic import that
      // only the development branch of `server/main.ts` ever reaches. Leaving
      // it external keeps it - and its own dependency tree - out of the bundle.
      external: ['vite'],
    },

    ssr: true,

    target: 'node24',
  },
  resolve: {
    tsconfigPaths: true,

    // `build.ssr` externalizes bare imports by default, which is the opposite
    // of what this build is for: everything the runtime needs has to be inlined.
    noExternal: true,
  },
});
