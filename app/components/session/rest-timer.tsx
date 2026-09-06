import { TimerIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { Button } from '~/components/ui/button';
import { formatRemaining, remainingSeconds } from '~/lib/rest-timer';

const THIRTY_SECONDS = 30_000;

function storageKey(exerciseId: string): string {
  return `rest-timer:${exerciseId}`;
}

/** `sessionStorage` can throw in private-browsing contexts; a lost timer is not worth failing the page over. */
function readDeadline(key: string): number | null {
  try {
    const stored = sessionStorage.getItem(key);
    const parsed = stored === null ? NaN : Number(stored);
    return Number.isFinite(parsed) && parsed > Date.now() ? parsed : null;
  } catch {
    return null;
  }
}

function writeDeadline(key: string, deadline: number | null): void {
  try {
    if (deadline === null) sessionStorage.removeItem(key);
    else sessionStorage.setItem(key, String(deadline));
  } catch {
    // Nothing to fall back to - the countdown still works for this page view.
  }
}

/**
 * A countdown between sets, rendered inside an exercise's card between its
 * `SetProgress` and its log form.
 *
 * `signal` is the count of sets already logged for this exercise on the page
 * being viewed - a fresh set increasing it is what starts (or restarts) the
 * countdown, which is equivalent to "the log form's fetcher went submitting
 * to idle" without this component needing a hold of that fetcher itself.
 *
 * The deadline, not the remaining count, is what persists to
 * `sessionStorage`: reopening the page recomputes "how much is left" from the
 * wall clock, so the timer stays correct across a navigation or a
 * backgrounded tab rather than resuming from a stale countdown.
 */
function RestTimer({ exerciseId, restSeconds, signal }: { exerciseId: string; restSeconds: number | null; signal: number }) {
  const key = storageKey(exerciseId);

  // Every render before hydration must match the server's, which has no
  // access to sessionStorage or the wall clock - so nothing renders until an
  // effect confirms the client has taken over.
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);

  const [deadline, setDeadline] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const previousSignal = useRef(signal);

  useEffect(() => {
    if (hydrated) setDeadline(readDeadline(key));
  }, [hydrated, key]);

  useEffect(() => {
    if (signal > previousSignal.current && restSeconds != null) {
      const next = Date.now() + restSeconds * 1000;
      setDeadline(next);
      writeDeadline(key, next);
    }
    previousSignal.current = signal;
  }, [signal, restSeconds, key]);

  useEffect(() => {
    if (deadline === null) return;
    setNow(Date.now());
    const ticking = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(ticking);
  }, [deadline]);

  const remaining = deadline === null ? 0 : remainingSeconds(deadline, now);

  useEffect(() => {
    if (deadline !== null && remaining <= 0) {
      setDeadline(null);
      writeDeadline(key, null);
      if ('vibrate' in navigator) navigator.vibrate(200);
    }
  }, [remaining, deadline, key]);

  if (!hydrated || deadline === null) return null;

  function skip() {
    setDeadline(null);
    writeDeadline(key, null);
  }

  function addThirtySeconds() {
    setDeadline((current) => {
      if (current === null) return current;
      const next = current + THIRTY_SECONDS;
      writeDeadline(key, next);
      return next;
    });
  }

  return (
    <div className="flex items-center gap-2 rounded-lg bg-muted/60 px-3 py-2 text-sm">
      <TimerIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <span className="tabular-nums" role="timer">
        {formatRemaining(remaining)}
      </span>
      <span className="text-muted-foreground">rest</span>
      <div className="ml-auto flex gap-1">
        <Button type="button" variant="ghost" size="xs" onClick={addThirtySeconds}>
          +30s
        </Button>
        <Button type="button" variant="ghost" size="xs" onClick={skip}>
          Skip
        </Button>
      </div>
    </div>
  );
}

export { RestTimer };
