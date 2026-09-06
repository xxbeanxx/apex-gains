import type { INestApplication } from '@nestjs/common';

import type { NestSingletons } from '~/lib/nest-bridge.server';
import { AdminService } from '~/services/admin-service.server';
import { AthleteService } from '~/services/athlete-service.server';
import { BodyMeasurementsService } from '~/services/body-measurements-service.server';
import { BodyWeightService } from '~/services/body-weight-service.server';
import { ExerciseLibraryService } from '~/services/exercise-library-service.server';
import { ExportService } from '~/services/export-service.server';
import { ProgressService } from '~/services/progress-service.server';
import { PlanImportService } from '~/services/plan-import-service.server';
import { PlanService } from '~/services/plan-service.server';
import { WorkoutService } from '~/services/workout-service.server';
import { TrainingPlanService } from '~/services/training-plan-service.server';
import { SessionService } from '~/services/session-service.server';

import { OIDC_CLIENT_CONFIG, OIDC_STATE_COOKIE, SESSION_STORAGE } from '../auth/tokens';
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
    planImportService: app.get(PlanImportService),
    planService: app.get(PlanService),
    progressService: app.get(ProgressService),
    sessionService: app.get(SessionService),
    trainingPlanService: app.get(TrainingPlanService),
    workoutService: app.get(WorkoutService),
    //
    oidcConfig: app.get(OIDC_CLIENT_CONFIG),
    oidcStateCookie: app.get(OIDC_STATE_COOKIE),
    sessionStorage: app.get(SESSION_STORAGE),
    //
    testLoginConfig: app.get(testLoginConfig.KEY),
  };
}
