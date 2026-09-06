import { Module } from '@nestjs/common';

import { AdminService } from '~/services/admin-service.server';
import { AthleteService } from '~/services/athlete-service.server';
import { BodyMeasurementsService } from '~/services/body-measurements-service.server';
import { BodyWeightService } from '~/services/body-weight-service.server';
import { ExerciseLibraryService } from '~/services/exercise-library-service.server';
import { ExportService } from '~/services/export-service.server';
import { ProgressService } from '~/services/progress-service.server';
import { PlanImportService } from '~/services/plan-import-service.server';
import { PlanService } from '~/services/plan-service.server';
import { productionDeps } from '~/services/shared/deps.server';
import { WorkoutService } from '~/services/workout-service.server';
import { TrainingPlanService } from '~/services/training-plan-service.server';
import { DOMAIN_DEPS } from '~/services/shared/tokens';
import { SessionService } from '~/services/session-service.server';

import { RepositoriesModule } from '../repositories/repositories.module';

const services = [
  AdminService,
  AthleteService,
  BodyMeasurementsService,
  BodyWeightService,
  ExerciseLibraryService,
  ExportService,
  PlanImportService,
  PlanService,
  ProgressService,
  SessionService,
  TrainingPlanService,
  WorkoutService,
];

@Module({
  imports: [RepositoriesModule],
  providers: [{ provide: DOMAIN_DEPS, useValue: productionDeps }, ...services],
  exports: services,
})
export class ServicesModule {}
