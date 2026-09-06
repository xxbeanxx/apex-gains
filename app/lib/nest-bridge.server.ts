import type { ConfigType } from '@nestjs/config';
import type { Cookie, RouterContext } from 'react-router';
import { createContext, RouterContextProvider } from 'react-router';

import type { AdminService } from '~/services/admin-service.server';
import type { AthleteService } from '~/services/athlete-service.server';
import type { BodyWeightService } from '~/services/body-weight-service.server';
import type { ExerciseLibraryService } from '~/services/exercise-library-service.server';
import type { ExportService } from '~/services/export-service.server';
import type { ProgressService } from '~/services/progress-service.server';
import type { PlanImportService } from '~/services/plan-import-service.server';
import type { PlanService } from '~/services/plan-service.server';
import type { WorkoutService } from '~/services/workout-service.server';
import type { TrainingPlanService } from '~/services/training-plan-service.server';
import type { SessionService } from '~/services/session-service.server';

import type { OidcClient } from '~server/auth/oidc-client.provider';
import type { AppSessionStorage } from '~server/auth/session-storage.provider';
import type { testLoginConfig } from '~server/config/test-login.config';
import type { AppLogger } from '~server/logging/logger.provider';

/**
 * The Nest -> React Router boundary.
 *
 * Nest (`server/main.ts`) runs directly under `tsx`, outside Vite's module
 * graph; every route always loads through Vite (dev's SSR pipeline, or the
 * bundled production server). Those are two separate module instances of
 * this file, which is why the tokens live here under `app/` rather than in
 * `server/`: `createContext()` returns a fresh object per call and
 * `RouterContextProvider` keys its map by that object's identity, so a token
 * minted in Nest-land could never be `===` the one a route reads.
 *
 * `nestLoadContext` is called from `server/react-router/handler.ts`, which is
 * the React Router build's own entry point and so loads this file from the
 * same copy the routes do. Nest only supplies the values.
 */

/**
 * Every value Nest hands over, keyed by name. The context tokens, the
 * `NestSingletons` shape Nest must supply, and `nestLoadContext` are all
 * derived from this object, so a value Nest forgets to supply is a type
 * error rather than an `undefined` at request time.
 *
 * The name itself is still written in three more places - the destructured
 * exports below, `server/services/services.module.ts`'s provider list, and
 * `server/react-router/singletons.ts` - but only the first of those can be
 * got wrong silently, and the compiler catches the other two.
 */
const contexts = {
  adminService: createContext<AdminService>(),
  athleteService: createContext<AthleteService>(),
  bodyWeightService: createContext<BodyWeightService>(),
  exerciseLibraryService: createContext<ExerciseLibraryService>(),
  exportService: createContext<ExportService>(),
  progressService: createContext<ProgressService>(),
  planImportService: createContext<PlanImportService>(),
  planService: createContext<PlanService>(),
  workoutService: createContext<WorkoutService>(),
  trainingPlanService: createContext<TrainingPlanService>(),
  sessionService: createContext<SessionService>(),
  sessionStorage: createContext<AppSessionStorage>(),
  oidcConfig: createContext<OidcClient>(),
  oidcStateCookie: createContext<Cookie>(),
  testLoginConfig: createContext<ConfigType<typeof testLoginConfig>>(),
  /** The process-wide logger, which Nest's own internal logging also goes through. */
  logger: createContext<AppLogger>(),
} as const;

export const {
  adminService: adminServiceContext,
  athleteService: athleteServiceContext,
  bodyWeightService: bodyWeightServiceContext,
  exerciseLibraryService: exerciseLibraryServiceContext,
  exportService: exportServiceContext,
  progressService: progressServiceContext,
  planImportService: planImportServiceContext,
  planService: planServiceContext,
  workoutService: workoutServiceContext,
  trainingPlanService: trainingPlanServiceContext,
  sessionService: sessionServiceContext,
  sessionStorage: sessionStorageContext,
  oidcConfig: oidcConfigContext,
  oidcStateCookie: oidcStateCookieContext,
  testLoginConfig: testLoginConfigContext,
  logger: nestLoggerContext,
} = contexts;

/**
 * What `server/react-router/singletons.ts` must collect from the DI
 * container: one value per context above, checked by the compiler on both
 * sides.
 */
export type NestSingletons = {
  [K in keyof typeof contexts]: (typeof contexts)[K] extends RouterContext<infer V> ? V : never;
};

/**
 * Builds the load context for one request. Every context above is populated
 * before routing starts, so a loader, an action, or `handleError` on an
 * unmatched URL can all read one unconditionally.
 */
export function nestLoadContext(singletons: NestSingletons): RouterContextProvider {
  const context = new RouterContextProvider();
  for (const key of Object.keys(contexts) as (keyof typeof contexts)[]) {
    // `set` can't correlate context and value through a union key, so it is
    // widened here. `NestSingletons` is what actually pairs the two, and
    // `keyof typeof contexts` is what keeps this loop faithful to it.
    context.set(contexts[key] as RouterContext<unknown>, singletons[key]);
  }
  return context;
}
