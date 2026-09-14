import { data } from 'react-router';
import { getBuildDetails } from '~web/lib/build-info';

/**
 * Resource route (no default export - polled by `VersionCheck`, and a plain
 * GET for anyone troubleshooting a deploy) reporting everything about the
 * running build. `no-store` matters: the whole point is that a client still
 * holding a previous deploy's response can see a different one.
 */
export function loader() {
  return data(getBuildDetails(), { headers: { 'Cache-Control': 'no-store' } });
}
