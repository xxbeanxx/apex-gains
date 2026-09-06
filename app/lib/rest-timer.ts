/**
 * The pure arithmetic behind the rest timer - deliberately free of
 * `sessionStorage`, `setInterval` and React, so it runs the same on the
 * server and in a test as it does live in the browser.
 */

/** Whole seconds left until `deadlineMs`, floored at zero rather than going negative. */
export function remainingSeconds(deadlineMs: number, nowMs: number): number {
  return Math.max(0, Math.ceil((deadlineMs - nowMs) / 1000));
}

/** "1:30", "0:05" - minutes:seconds, the seconds half zero-padded. */
export function formatRemaining(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}
