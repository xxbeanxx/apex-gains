import { useEffect, useRef } from 'react';

import { useFetcher } from 'react-router';

import { RefreshCwIcon } from 'lucide-react';

import { Button } from '~/components/ui/button';
import type { BuildDetails } from '~/lib/build-info';

const POLL_INTERVAL_MS = 15 * 60 * 1000;

/**
 * Polls `/api/buildinfo` for the build the server is currently running and
 * offers a reload once its `imageTag` differs from `initialBuildInfo` (the
 * build this page was rendered by). Client-side navigation never re-requests
 * the document, so without this a tab left open across a deploy keeps
 * running a JS bundle whose chunks the new deploy no longer serves.
 */
function VersionCheck({ initialBuildInfo }: { initialBuildInfo: string }) {
  const fetcher = useFetcher<BuildDetails>();
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  useEffect(() => {
    function check() {
      if (fetcherRef.current.state === 'idle') {
        fetcherRef.current.load('/api/buildinfo');
      }
    }

    function onVisibilityChange() {
      if (document.visibilityState === 'visible') {
        check();
      }
    }

    const interval = setInterval(check, POLL_INTERVAL_MS);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, []);

  const updateAvailable = fetcher.data !== undefined && fetcher.data.imageTag !== initialBuildInfo;
  if (!updateAvailable) {
    return null;
  }

  return (
    <div
      role="status"
      className="fixed inset-x-4 bottom-[calc(var(--bottom-tabs-h)+env(safe-area-inset-bottom)+1rem)] z-50 mx-auto flex max-w-sm items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3 text-sm shadow-lg md:inset-x-auto md:right-4 md:bottom-4"
    >
      <span>A new version is available.</span>
      <Button type="button" size="sm" onClick={() => window.location.reload()}>
        <RefreshCwIcon aria-hidden="true" />
        Reload
      </Button>
    </div>
  );
}

export { VersionCheck };
