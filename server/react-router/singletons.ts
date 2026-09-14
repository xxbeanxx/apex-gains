import type { INestApplication, Type } from '@nestjs/common';
import { AthleteCalendar } from '~application/shared/athlete-calendar';
import { AdminService } from '~application/use-cases/admin-service';
import { AthleteService } from '~application/use-cases/athlete-service';
import { BodyMeasurementsService } from '~application/use-cases/body-measurements-service';
import { BodyWeightService } from '~application/use-cases/body-weight-service';
import { ExerciseLibraryService } from '~application/use-cases/exercise-library-service';
import { ExportService } from '~application/use-cases/export-service';
import { IdentityService } from '~application/use-cases/identity-service';
import { PlanImportService } from '~application/use-cases/plan-import-service';
import { PlanService } from '~application/use-cases/plan-service';
import { ProgressService } from '~application/use-cases/progress-service';
import { SessionService } from '~application/use-cases/session-service';
import { TrainingPlanService } from '~application/use-cases/training-plan-service';
import { WorkoutService } from '~application/use-cases/workout-service';
import { OIDC_STATE_COOKIE, SESSION_STORAGE } from '~server/auth/tokens';
import { testLoginConfig } from '~server/config/test-login.config';
import { LOGGER } from '~server/logging/tokens';
import type { NestSingletons } from '~web/router/load-context';

/**
 * Where in the DI container each load-context value lives, keyed as
 * `NestSingletons` is.
 *
 * Typed off `NestSingletons`, so adding a context in
 * `web/router/load-context.ts` without a line here - or a line naming a
 * class of the wrong type - fails to compile. A symbol or string token
 * carries no type, so for the logger, the cookie, the session storage and
 * the test-login config only the key is checked.
 */
const singletonTokens: { readonly [K in keyof NestSingletons]: Type<NestSingletons[K]> | symbol | string } = {
  logger: LOGGER,
  athleteCalendar: AthleteCalendar,
  //
  adminService: AdminService,
  athleteService: AthleteService,
  bodyMeasurementsService: BodyMeasurementsService,
  bodyWeightService: BodyWeightService,
  exerciseLibraryService: ExerciseLibraryService,
  exportService: ExportService,
  identityService: IdentityService,
  planImportService: PlanImportService,
  planService: PlanService,
  progressService: ProgressService,
  sessionService: SessionService,
  trainingPlanService: TrainingPlanService,
  workoutService: WorkoutService,
  //
  oidcStateCookie: OIDC_STATE_COOKIE,
  sessionStorage: SESSION_STORAGE,
  //
  testLoginConfig: testLoginConfig.KEY,
};

/**
 * Pulls every singleton the React Router app reads through load context out
 * of the DI container. Called once at bootstrap, so an unregistered provider
 * fails the server start rather than a request.
 */
export function collectNestSingletons(app: INestApplication): NestSingletons {
  // `Object.entries` forgets which token goes with which key; the map's own
  // type above is what actually pairs them.
  return Object.fromEntries(Object.entries(singletonTokens).map(([key, token]) => [key, app.get(token)])) as NestSingletons;
}
