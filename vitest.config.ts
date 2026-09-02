import path from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

const dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "~": path.resolve(dirname, "app"),
    },
  },
  test: {
    environment: "node",
    env: {
      // Modules under app/db and app/auth read these at import time; tests
      // never open a real connection (drizzle-orm/postgres-js and
      // createCookieSessionStorage are both lazy), so dummy values are safe.
      DATABASE_URL: "postgres://test:test@localhost:5432/test",
      SESSION_SECRET: "test-session-secret",
      ORIGIN: "http://localhost:5173",
      GOOGLE_CLIENT_ID: "test-google-client-id",
      GOOGLE_CLIENT_SECRET: "test-google-client-secret",
    },
  },
});
