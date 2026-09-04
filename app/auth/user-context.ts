import { createContext } from 'react-router';

import type { Athlete } from '~/domain/athlete/athlete';

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
