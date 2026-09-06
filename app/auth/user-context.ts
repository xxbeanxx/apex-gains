import { createContext, type RouterContextProvider } from 'react-router';

import type { Athlete } from '~domain/athlete/athlete';

/**
 * The signed-in athlete, populated by `loadUserMiddleware` on every request
 * and read in loaders and actions with `context.get(userContext)`.
 *
 * Holds the `Athlete` aggregate rather than the raw `users` row, so a loader
 * has the athlete's preferences and their behaviour to hand - which is what
 * every service needs to format a weight or decide whether to include sample
 * data.
 */
export const userContext = createContext<Athlete | null>(null);

/**
 * The athlete on a route nested under the `_protected` layout, where
 * `requireUserMiddleware` has already redirected anyone anonymous.
 *
 * The context is nullable because `loadUserMiddleware` runs on every request,
 * signed in or not. Under the layout that guarantee has already been made and
 * the null is unreachable, so this states it once rather than leaving a `!` at
 * every loader and action that reads it.
 */
export function requireAthlete(context: Readonly<RouterContextProvider>): Athlete {
  const athlete = context.get(userContext);
  if (!athlete) {
    throw new Error('requireAthlete outside the _protected layout - requireUserMiddleware has not run');
  }
  return athlete;
}
