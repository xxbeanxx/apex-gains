function requireEnv(name: string): string {
  const value = process.env[name];

  if (!value) { throw new Error(`${name} environment variable is not set`); }

  return value;
}

export function getOrigin(): string {
  return requireEnv("ORIGIN").replace(/\/+$/, "");
}

export function getSessionSecret(): string {
  return requireEnv("SESSION_SECRET");
}

export function getGoogleClientId(): string {
  return requireEnv("GOOGLE_CLIENT_ID");
}

export function getGoogleClientSecret(): string {
  return requireEnv("GOOGLE_CLIENT_SECRET");
}

// Off by default - only e2e/CI environments should ever set this. Unlike
// the getters above, this has no "unset" failure mode: absence just means disabled.
export function isTestLoginEnabled(): boolean {
  return process.env.ENABLE_TEST_LOGIN === "true";
}
