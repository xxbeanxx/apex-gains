import type { Cookie, MiddlewareFunction, RouterContext } from 'react-router';
import { createContext } from 'react-router';

import type { AthleteService } from '~/services/athlete-service.server';
import type { BodyWeightService } from '~/services/body-weight-service.server';
import type { ExerciseLibraryService } from '~/services/exercise-library-service.server';
import type { ProgressService } from '~/services/progress-service.server';
import type { RoutineService } from '~/services/routine-service.server';
import type { TemplateService } from '~/services/template-service.server';
import type { TrainingPlanService } from '~/services/training-plan-service.server';
import type { WorkoutLogService } from '~/services/workout-log-service.server';

import type { AppConfig } from '~server/config/app.config';
import type { OidcClientProvider } from '~server/auth/oidc-client.provider';
import type { AppSessionStorage } from '~server/auth/session-storage.provider';
import type { AppLogger } from '~server/logging/logger.provider';

/**
 * The Nest -> React Router boundary.
 *
 * Nest (`server/main.ts`) runs directly under `tsx`, outside Vite's module
 * graph; every route and middleware always loads through Vite (dev's SSR
 * pipeline, or the bundled production server). Those are two separate
 * module instances of this file, which dictates the whole shape here:
 *
 *  - The tokens and `nestBridgeMiddleware` live under `app/`, not `server/`.
 *    `createContext()` returns a fresh object per call and
 *    `RouterContextProvider` keys its map by that object's identity, so a
 *    token minted in Nest-land could never be `===` the one a route reads.
 *    Keeping both inside the Vite-loaded graph sidesteps that entirely.
 *
 *  - Only the *values* cross the boundary, and they cross via `globalThis`
 *    (`registerNestSingletons`) because that is the one thing genuinely
 *    shared between the two loaders: one `globalThis` per process however
 *    many copies of this module exist, and `Symbol.for` - a process-wide
 *    registry, not a fresh `Symbol()` - resolves to the same key in each.
 *
 * Everything downstream still reads exclusively through `context.get(...)`.
 */
/**
 * Every value Nest hands over, keyed by name. This object is the single
 * declaration: the context tokens, the `NestSingletons` shape Nest must
 * supply, and the middleware that copies one into the other are all derived
 * from it, so adding a service is one edit here and a missing one is a type
 * error rather than an `undefined` at request time.
 */
const contexts = {
  athleteService: createContext<AthleteService>(),
  bodyWeightService: createContext<BodyWeightService>(),
  exerciseLibraryService: createContext<ExerciseLibraryService>(),
  progressService: createContext<ProgressService>(),
  routineService: createContext<RoutineService>(),
  templateService: createContext<TemplateService>(),
  trainingPlanService: createContext<TrainingPlanService>(),
  workoutLogService: createContext<WorkoutLogService>(),
  sessionStorage: createContext<AppSessionStorage>(),
  oidcConfig: createContext<OidcClientProvider>(),
  oidcStateCookie: createContext<Cookie>(),
  appConfig: createContext<AppConfig>(),
  /**
   * The process-wide logger, which Nest's own internal logging also goes
   * through. `requestLoggingMiddleware` (`app/lib/logger.server.ts`) puts it
   * on `loggerContext` for the request, and `getNestLogger()` below reaches
   * it from the paths that have no request context.
   */
  logger: createContext<AppLogger>(),
} as const;

export const {
  athleteService: athleteServiceContext,
  bodyWeightService: bodyWeightServiceContext,
  exerciseLibraryService: exerciseLibraryServiceContext,
  progressService: progressServiceContext,
  routineService: routineServiceContext,
  templateService: templateServiceContext,
  trainingPlanService: trainingPlanServiceContext,
  workoutLogService: workoutLogServiceContext,
  sessionStorage: sessionStorageContext,
  oidcConfig: oidcConfigContext,
  oidcStateCookie: oidcStateCookieContext,
  appConfig: appConfigContext,
  logger: nestLoggerContext,
} = contexts;

/**
 * What `server/react-router/load-context.provider.ts` must hand over: one
 * value per context above, checked by the compiler on both sides.
 */
export type NestSingletons = {
  [K in keyof typeof contexts]: (typeof contexts)[K] extends RouterContext<infer V> ? V : never;
};

const GLOBAL_KEY = Symbol.for('apex-gains.nest-singletons');

type GlobalWithSingletons = typeof globalThis & {
  [GLOBAL_KEY]?: NestSingletons;
};

/**
 * Called once from `server/main.ts` during Nest bootstrap, after every
 * singleton has been resolved from the DI container. See the file header
 * for why the hand-off goes through `globalThis`.
 */
export function registerNestSingletons(singletons: NestSingletons): void {
  (globalThis as GlobalWithSingletons)[GLOBAL_KEY] = singletons;
}

function requireNestSingletons(): NestSingletons {
  const singletons = (globalThis as GlobalWithSingletons)[GLOBAL_KEY];
  if (!singletons) {
    throw new Error(
      'Nest singletons were not registered before the first request - ' +
        'registerNestSingletons() must run during server bootstrap.',
    );
  }
  return singletons;
}

/**
 * The one sanctioned exception to "everything crosses via `context.get(...)`":
 * `app/entry.server.tsx` installs process-wide `uncaughtException`/
 * `unhandledRejection` handlers at module load, before any request - and so
 * any load context - exists. Call this inside the handler body, never at
 * module scope, so it only runs once Nest has registered.
 */
export function getNestLogger(): AppLogger {
  return requireNestSingletons().logger;
}

/**
 * Populates every context above from the singletons Nest registered at
 * bootstrap. Must run before any other middleware or loader that reads one
 * of these contexts - see `app/root.tsx`.
 */
export const nestBridgeMiddleware: MiddlewareFunction<void | Response> = ({ context }) => {
  const singletons = requireNestSingletons();
  for (const key of Object.keys(contexts) as (keyof typeof contexts)[]) {
    // `set` can't correlate context and value through a union key, so it is
    // widened here. `NestSingletons` is what actually pairs the two, and
    // `keyof typeof contexts` is what keeps this loop faithful to it.
    context.set(contexts[key] as RouterContext<unknown>, singletons[key]);
  }
};
