import { execSync } from "node:child_process";

/**
 * `VERSION_TAG` is baked into the container image at build time (see
 * containerfile and .github/workflows/build.yml) as `date-sha-buildnum`.
 * Outside a container - dev server, local `npm run start` - it's unset, so
 * fall back to the working tree's short commit SHA.
 */
export function getBuildInfo(): string {
  const versionTag = process.env.VERSION_TAG;
  if (versionTag) {
    return versionTag;
  }

  try {
    return execSync("git rev-parse --short=8 HEAD").toString().trim();
  } catch {
    return "unknown";
  }
}
