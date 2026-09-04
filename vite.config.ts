/// <reference types="vitest/config" />

import { reactRouter } from '@react-router/dev/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [tailwindcss(), reactRouter()],
  resolve: {
    tsconfigPaths: true,
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
});
