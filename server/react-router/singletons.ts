import type { INestApplication } from '@nestjs/common';

import type { NestSingletons } from '~/router/load-context';
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

import { OIDC_STATE_COOKIE, SESSION_STORAGE } from '../auth/tokens';
import { testLoginConfig } from '../config/test-login.config';
import { LOGGER } from '../logging/tokens';

/**
 * Pulls every singleton the React Router app reads through load context out
 * of the DI container. Called once at bootstrap, so an unregistered provider
 * fails the server start rather than a request.
 */
export function collectNestSingletons(app: INestApplication): NestSingletons {
  return {
    logger: app.get(LOGGER),
    //
    adminService: app.get(AdminService),
    athleteService: app.get(AthleteService),
    bodyMeasurementsService: app.get(BodyMeasurementsService),
    bodyWeightService: app.get(BodyWeightService),
    exerciseLibraryService: app.get(ExerciseLibraryService),
    exportService: app.get(ExportService),
    identityService: app.get(IdentityService),
    planImportService: app.get(PlanImportService),
    planService: app.get(PlanService),
    progressService: app.get(ProgressService),
    sessionService: app.get(SessionService),
    trainingPlanService: app.get(TrainingPlanService),
    workoutService: app.get(WorkoutService),
    //
    oidcStateCookie: app.get(OIDC_STATE_COOKIE),
    sessionStorage: app.get(SESSION_STORAGE),
    //
    testLoginConfig: app.get(testLoginConfig.KEY),
  };
}
