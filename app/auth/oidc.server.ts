import * as client from "openid-client";

import { getGoogleClientId, getGoogleClientSecret } from "./env.server";

let configPromise: Promise<client.Configuration> | null = null;

export function getGoogleConfig(): Promise<client.Configuration> {
  if (!configPromise) {
    configPromise = client.discovery(
      new URL("https://accounts.google.com"),
      getGoogleClientId(),
      getGoogleClientSecret(),
    );
  }
  return configPromise;
}
