import { Module } from '@nestjs/common';

import { AthleteService } from '~/services/athlete-service.server';
import { BodyWeightService } from '~/services/body-weight-service.server';
import { ExerciseLibraryService } from '~/services/exercise-library-service.server';
import { ProgressService } from '~/services/progress-service.server';
import { RoutineService } from '~/services/routine-service.server';
import { productionDeps } from '~/services/shared/deps.server';
import { TemplateService } from '~/services/template-service.server';
import { TrainingPlanService } from '~/services/training-plan-service.server';
import { DOMAIN_DEPS } from '~/services/shared/tokens';
import { WorkoutLogService } from '~/services/workout-log-service.server';

import { RepositoriesModule } from '../repositories/repositories.module';

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

@Module({
  imports: [RepositoriesModule],
  providers: [{ provide: DOMAIN_DEPS, useValue: productionDeps }, ...services],
  exports: services,
})
export class ServicesModule {}
