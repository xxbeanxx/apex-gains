import { Module } from "@nestjs/common";

import { AthleteService } from "~/services/athlete-service.server";
import { BodyWeightService } from "~/services/body-weight-service.server";
import { ExerciseLibraryService } from "~/services/exercise-library-service.server";
import { ProgressService } from "~/services/progress-service.server";
import { RoutineService } from "~/services/routine-service.server";
import { productionDeps } from "~/services/shared/deps.server";
import { TemplateService } from "~/services/template-service.server";
import { TrainingPlanService } from "~/services/training-plan-service.server";
import { WorkoutLogService } from "~/services/workout-log-service.server";

import { RepositoriesModule } from "../repositories/repositories.module";
import { DOMAIN_DEPS } from "./tokens";

const services = [
  AthleteService,
  BodyWeightService,
  ExerciseLibraryService,
  ProgressService,
  RoutineService,
  TemplateService,
  TrainingPlanService,
  WorkoutLogService,
];

/**
 * Registers each `app/services/*.server.ts` use-case class as a Nest
 * provider - they're `@Injectable()` with `@Inject()`-tokenized
 * constructors (see the classes themselves), so Nest's default singleton
 * scope is what replaces their old manual `XService.forRequest()` +
 * module-level cache.
 */
@Module({
  imports: [RepositoriesModule],
  providers: [
    { provide: DOMAIN_DEPS, useValue: productionDeps },
    ...services,
  ],
  exports: services,
})
export class ServicesModule {}
