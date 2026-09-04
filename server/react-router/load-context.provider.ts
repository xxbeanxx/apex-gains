import { Inject, Injectable } from "@nestjs/common";
import type { ConfigType } from "@nestjs/config";
import type { Cookie } from "react-router";

import { registerNestSingletons } from "~/lib/nest-bridge.server";
import { AthleteService } from "~/services/athlete-service.server";
import { BodyWeightService } from "~/services/body-weight-service.server";
import { ExerciseLibraryService } from "~/services/exercise-library-service.server";
import { ProgressService } from "~/services/progress-service.server";
import { RoutineService } from "~/services/routine-service.server";
import { TemplateService } from "~/services/template-service.server";
import { TrainingPlanService } from "~/services/training-plan-service.server";
import { WorkoutLogService } from "~/services/workout-log-service.server";

import type { OidcClientProvider } from "../auth/oidc-client.provider";
import type { AppSessionStorage } from "../auth/session-storage.provider";
import {
  OIDC_CLIENT_CONFIG,
  OIDC_STATE_COOKIE,
  SESSION_STORAGE,
} from "../auth/tokens";
import { appConfig } from "../config/app.config";
import type { AppLogger } from "../logging/logger.provider";
import { LOGGER } from "../logging/tokens";

/**
 * Gathers every Nest-resolved singleton the React Router app needs and
 * publishes them for `nestBridgeMiddleware` to pick up. See
 * `app/lib/nest-bridge.server.ts` for why the hand-off goes through
 * `registerNestSingletons` rather than a `RouterContextProvider` built here.
 */
@Injectable()
export class LoadContextProvider {
  constructor(
    @Inject(AthleteService) private readonly athleteService: AthleteService,
    @Inject(BodyWeightService)
    private readonly bodyWeightService: BodyWeightService,
    @Inject(ExerciseLibraryService)
    private readonly exerciseLibraryService: ExerciseLibraryService,
    @Inject(ProgressService)
    private readonly progressService: ProgressService,
    @Inject(RoutineService) private readonly routineService: RoutineService,
    @Inject(TemplateService)
    private readonly templateService: TemplateService,
    @Inject(TrainingPlanService)
    private readonly trainingPlanService: TrainingPlanService,
    @Inject(WorkoutLogService)
    private readonly workoutLogService: WorkoutLogService,
    @Inject(SESSION_STORAGE)
    private readonly sessionStorage: AppSessionStorage,
    @Inject(OIDC_CLIENT_CONFIG)
    private readonly oidcConfig: OidcClientProvider,
    @Inject(OIDC_STATE_COOKIE) private readonly oidcStateCookie: Cookie,
    @Inject(appConfig.KEY)
    private readonly appConfigValue: ConfigType<typeof appConfig>,
    @Inject(LOGGER) private readonly logger: AppLogger,
  ) {}

  /** Call once during bootstrap, before the server starts accepting requests. */
  register(): void {
    registerNestSingletons({
      athleteService: this.athleteService,
      bodyWeightService: this.bodyWeightService,
      exerciseLibraryService: this.exerciseLibraryService,
      progressService: this.progressService,
      routineService: this.routineService,
      templateService: this.templateService,
      trainingPlanService: this.trainingPlanService,
      workoutLogService: this.workoutLogService,
      sessionStorage: this.sessionStorage,
      oidcConfig: this.oidcConfig,
      oidcStateCookie: this.oidcStateCookie,
      appConfig: this.appConfigValue,
      logger: this.logger,
    });
  }
}
