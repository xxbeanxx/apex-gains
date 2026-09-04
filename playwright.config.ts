import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end suite. Unit tests are configured under `test` in
 * `vite.config.ts`; Playwright's runner reads only this file.
 *
 * The suite runs against a production build (`npm run preview`), not the dev
 * server, so what it exercises is what actually ships - and no dev-only
 * machinery (Vite's lazy dependency pre-bundling, its HMR socket) can perturb
 * a page mid-assertion.
 */

/** Not 3000: `npm run dev` owns that, and this server must not collide. */
const PORT = 3100;
const BASE_URL = `http://localhost:${PORT}/`;

export default defineConfig({
  testDir: './e2e/',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [['list'], ['html', { open: 'never' }]],
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'npm run preview',
    env: {
      // Blank, not absent: this is what selects the in-memory adapter for
      // every repository port. `preview` passes `--env-file-if-exists`, and
      // node's env-file never overwrites a variable already set here (an
      // empty string counts as set), so a real `DATABASE_URL` in `.env`
      // cannot reach a run that is supposed to be in-memory.
      DATABASE_URL: '',
      ENABLE_TEST_LOGIN: 'true',
      LOG_LEVEL: 'warn',
      PORT: String(PORT),
      // Real values are only needed to reach Google, which no spec does -
      // but config validation refuses to boot without them.
      GOOGLE_CLIENT_ID: 'e2e-google-client-id',
      GOOGLE_CLIENT_SECRET: 'e2e-google-client-secret',
      SESSION_SECRET: 'e2e-session-secret',
    },
    // Never adopt a server this config did not start. `preview` rebuilds
    // before it serves, so reuse would silently test whatever was built last
    // - and a server left on this port by a manual `npm run preview` would
    // have taken its `DATABASE_URL` from `.env`, which the env above is
    // careful to prevent.
    reuseExistingServer: false,
    url: BASE_URL,
    // Covers the build `preview` runs first.
    timeout: 180_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
