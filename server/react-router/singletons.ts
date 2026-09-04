import type { INestApplication } from '@nestjs/common';

import type { NestSingletons } from '~/lib/nest-bridge.server';
import { AdminService } from '~/services/admin-service.server';
import { AthleteService } from '~/services/athlete-service.server';
import { BodyWeightService } from '~/services/body-weight-service.server';
import { ExerciseLibraryService } from '~/services/exercise-library-service.server';
import { ProgressService } from '~/services/progress-service.server';
import { RoutineService } from '~/services/routine-service.server';
import { TemplateService } from '~/services/template-service.server';
import { TrainingPlanService } from '~/services/training-plan-service.server';
import { WorkoutLogService } from '~/services/workout-log-service.server';

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
    adminService: app.get(AdminService),
    athleteService: app.get(AthleteService),
    bodyWeightService: app.get(BodyWeightService),
    exerciseLibraryService: app.get(ExerciseLibraryService),
    progressService: app.get(ProgressService),
    routineService: app.get(RoutineService),
    templateService: app.get(TemplateService),
    trainingPlanService: app.get(TrainingPlanService),
    workoutLogService: app.get(WorkoutLogService),
    sessionStorage: app.get(SESSION_STORAGE),
    oidcConfig: app.get(OIDC_CLIENT_CONFIG),
    oidcStateCookie: app.get(OIDC_STATE_COOKIE),
    testLoginConfig: app.get(testLoginConfig.KEY),
    logger: app.get(LOGGER),
  };
}
