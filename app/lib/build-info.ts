import * as nodeChildProcess from 'node:child_process';
import * as nodeOs from 'node:os';

/**
 * `VERSION_TAG` is baked into the container image at build time (see
 * containerfile and .github/workflows/build.yml) as `date-sha-buildnum`.
 * Outside a container - dev server, local `npm run start` - it's unset, so
 * fall back to the working tree's short commit SHA.
 *
 * Imported as a namespace rather than `{ execSync }`: a route module with no
 * component (a resource route) only has its `loader` export stripped for the
 * browser bundle in dev, not its now-unused imports, so a named import off
 * `node:child_process` - externalized for the browser - throws the moment
 * this module loads there. A namespace import defers the property access
 * this function never reaches client-side. `getBuildDetails` below reads
 * `node:os` the same way, for the same reason.
 */
export function getBuildInfo(): string {
  const versionTag = process.env.VERSION_TAG;
  if (versionTag) {
    return versionTag;
  }

  try {
    return nodeChildProcess.execSync('git rev-parse --short=8 HEAD').toString().trim();
  } catch {
    return 'unknown';
  }
}

/**
 * `VERSION_TAG`'s shape when a container baked one in: an 8-digit UTC date,
 * an 8-character commit SHA, and an 8-character hex Unix timestamp (see
 * `.github/workflows/build.yaml`'s `tags` step), joined with `-`. Outside a
 * container `getBuildInfo()` falls back to a bare SHA, which this doesn't
 * match, so `buildId`/`buildDate` stay `null` - there was no build, only a
 * checkout.
 */
const VERSION_TAG_PATTERN = /^\d{8}-([0-9a-f]{7,40})-([0-9a-f]{8})$/;

export interface BuildDetails {
  /**
   * The full tag this build was published under, or the bare commit SHA outside a container.
   */
  imageTag: string;
  /**
   * The commit this build was built from, when known.
   */
  buildRevision: string | null;
  /**
   * When the image was built, decoded from `buildId`'s hex Unix timestamp.
   */
  buildDate: string | null;
  /**
   * The hex Unix timestamp segment of `imageTag` - unique to a build even when several happen the same day.
   */
  buildId: string | null;
  /**
   * `NODE_ENV` the running process was started with.
   */
  nodeEnv: string;
  /**
   * This process's hostname - the container/replica id, useful for telling which instance answered when more than one is running.
   */
  hostname: string;
  /**
   * When this module first loaded - a close proxy for when this server process started, since it loads early in bootstrap and the module only evaluates once.
   */
  serverStartedAt: string;
}

const serverStartedAt = new Date().toISOString();

export function getBuildDetails(): BuildDetails {
  const imageTag = getBuildInfo();
  const match = imageTag.match(VERSION_TAG_PATTERN);
  const [, buildRevision, buildId] = match ?? [];

  return {
    imageTag,
    buildRevision: buildRevision ?? (imageTag !== 'unknown' ? imageTag : null),
    buildId: buildId ?? null,
    buildDate: buildId ? new Date(parseInt(buildId, 16) * 1000).toISOString() : null,
    nodeEnv: process.env.NODE_ENV ?? 'development',
    hostname: nodeOs.hostname(),
    serverStartedAt,
  };
}
