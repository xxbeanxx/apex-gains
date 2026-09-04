import type { Cookie, MiddlewareFunction } from "react-router";
import { createContext } from "react-router";

import type { AthletesRepository } from "~/repositories/athletes-repository.server";
import type { AthleteService } from "~/services/athlete-service.server";
import type { BodyWeightService } from "~/services/body-weight-service.server";
import type { ExerciseLibraryService } from "~/services/exercise-library-service.server";
import type { ProgressService } from "~/services/progress-service.server";
import type { RoutineService } from "~/services/routine-service.server";
import type { TemplateService } from "~/services/template-service.server";
import type { TrainingPlanService } from "~/services/training-plan-service.server";
import type { WorkoutLogService } from "~/services/workout-log-service.server";

import type { AppConfig } from "~server/config/app.config";
import type { OidcClientProvider } from "~server/auth/oidc-client.provider";
import type { AppSessionStorage } from "~server/auth/session-storage.provider";

/**
 * Everything Nest resolves and hands to the React Router app crosses the
 * boundary through these `createContext()` tokens - the same pattern this
 * app already uses for `userContext`/`loggerContext`.
 *
 * These tokens (and `nestBridgeMiddleware` below) have to live under `app/`,
 * not `server/`, even though every value behind them comes from Nest: Nest
 * (`server/main.ts`) runs directly under `tsx`, outside Vite's module
 * graph, while every route and middleware here is always loaded through
 * Vite (dev's SSR pipeline, or the bundled production server). Those are
 * two separate module instances, and `createContext()` returns a fresh
 * object each time it's called - `RouterContextProvider` keys its map by
 * that object's identity, so a token created in Nest-land could never be
 * `===` the token a route reads here. Keeping the tokens (and the
 * middleware that sets them) entirely inside the Vite-loaded graph avoids
 * that mismatch; only the *values* need to cross the tsx/Vite boundary,
 * which is the one thing `registerNestSingletons`/`globalThis` below is
 * for - see the comment there.
 */
export const athletesRepositoryContext =
  createContext<AthletesRepository>();

export const athleteServiceContext = createContext<AthleteService>();
export const bodyWeightServiceContext = createContext<BodyWeightService>();
export const exerciseLibraryServiceContext =
  createContext<ExerciseLibraryService>();
export const progressServiceContext = createContext<ProgressService>();
export const routineServiceContext = createContext<RoutineService>();
export const templateServiceContext = createContext<TemplateService>();
export const trainingPlanServiceContext =
  createContext<TrainingPlanService>();
export const workoutLogServiceContext = createContext<WorkoutLogService>();

export const sessionStorageContext = createContext<AppSessionStorage>();
export const oidcConfigContext = createContext<OidcClientProvider>();
export const oidcStateCookieContext = createContext<Cookie>();
export const appConfigContext = createContext<AppConfig>();

export type NestSingletons = {
  athletesRepository: AthletesRepository;
  athleteService: AthleteService;
  bodyWeightService: BodyWeightService;
  exerciseLibraryService: ExerciseLibraryService;
  progressService: ProgressService;
  routineService: RoutineService;
  templateService: TemplateService;
  trainingPlanService: TrainingPlanService;
  workoutLogService: WorkoutLogService;
  sessionStorage: AppSessionStorage;
  oidcConfig: OidcClientProvider;
  oidcStateCookie: Cookie;
  appConfig: AppConfig;
};

const GLOBAL_KEY = Symbol.for("apex-gains.nest-singletons");

type GlobalWithSingletons = typeof globalThis & {
  [GLOBAL_KEY]?: NestSingletons;
};

/**
 * Called once from `server/main.ts` during Nest bootstrap, after every
 * singleton below has been resolved from Nest's DI container.
 *
 * `globalThis` is the one thing genuinely shared across the tsx/Vite module
 * boundary described above - there is exactly one `globalThis` per process
 * no matter how many separate loaders have their own copy of this file's
 * module scope, and `Symbol.for` (a process-wide registry, not a fresh
 * `Symbol()`) guarantees every copy resolves to the same property key. This
 * is the *only* place that boundary is bridged with anything other than
 * `context.get(...)` - everything downstream (routes, other middleware)
 * still reads exclusively through load context.
 */
export function registerNestSingletons(singletons: NestSingletons): void {
  (globalThis as GlobalWithSingletons)[GLOBAL_KEY] = singletons;
}

function requireNestSingletons(): NestSingletons {
  const singletons = (globalThis as GlobalWithSingletons)[GLOBAL_KEY];
  if (!singletons) {
    throw new Error(
      "Nest singletons were not registered before the first request - " +
        "registerNestSingletons() must run during server bootstrap.",
    );
  }
  return singletons;
}

/**
 * Populates every context above from the singletons Nest registered at
 * bootstrap. Must run before any other middleware or loader that reads one
 * of these contexts - see `app/root.tsx`.
 */
export const nestBridgeMiddleware: MiddlewareFunction<void | Response> = ({
  context,
}) => {
  const s = requireNestSingletons();
  context.set(athletesRepositoryContext, s.athletesRepository);
  context.set(athleteServiceContext, s.athleteService);
  context.set(bodyWeightServiceContext, s.bodyWeightService);
  context.set(exerciseLibraryServiceContext, s.exerciseLibraryService);
  context.set(progressServiceContext, s.progressService);
  context.set(routineServiceContext, s.routineService);
  context.set(templateServiceContext, s.templateService);
  context.set(trainingPlanServiceContext, s.trainingPlanService);
  context.set(workoutLogServiceContext, s.workoutLogService);
  context.set(sessionStorageContext, s.sessionStorage);
  context.set(oidcConfigContext, s.oidcConfig);
  context.set(oidcStateCookieContext, s.oidcStateCookie);
  context.set(appConfigContext, s.appConfig);
};
