import { Module, type Provider } from '@nestjs/common';

import { productionDeps } from '~application/ports/domain-deps';
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
import { DOMAIN_DEPS } from '~server/providers/domain-deps.token';
import { GOOGLE_IDENTITY_PROVIDER } from '~server/providers/identity.token';
import {
  ADMIN_ACTIONS_REPOSITORY,
  ATHLETES_REPOSITORY,
  BODY_MEASUREMENTS_REPOSITORY,
  BODY_WEIGHT_REPOSITORY,
  EQUIPMENT_REPOSITORY,
  EXERCISES_REPOSITORY,
  PLANS_REPOSITORY,
  SESSIONS_REPOSITORY,
  UNIT_OF_WORK,
  WORKOUTS_REPOSITORY,
} from '~server/providers/persistence.tokens';

import { AuthModule } from '../auth/auth.module';
import { RepositoriesModule } from '../repositories/repositories.module';

const services: Provider[] = [
  {
    provide: AthleteService,
    inject: [ATHLETES_REPOSITORY, UNIT_OF_WORK, DOMAIN_DEPS],
    useFactory: (athletes, unitOfWork, deps) => new AthleteService(athletes, unitOfWork, deps),
  },
  {
    provide: IdentityService,
    inject: [GOOGLE_IDENTITY_PROVIDER],
    useFactory: (google) => new IdentityService(google),
  },
  {
    provide: BodyMeasurementsService,
    inject: [BODY_MEASUREMENTS_REPOSITORY, UNIT_OF_WORK, DOMAIN_DEPS],
    useFactory: (entries, unitOfWork, deps) => new BodyMeasurementsService(entries, unitOfWork, deps),
  },
  {
    provide: BodyWeightService,
    inject: [BODY_WEIGHT_REPOSITORY, UNIT_OF_WORK, DOMAIN_DEPS],
    useFactory: (entries, unitOfWork, deps) => new BodyWeightService(entries, unitOfWork, deps),
  },
  {
    provide: ExerciseLibraryService,
    inject: [EXERCISES_REPOSITORY, EQUIPMENT_REPOSITORY, UNIT_OF_WORK, DOMAIN_DEPS],
    useFactory: (exercises, equipment, unitOfWork, deps) => new ExerciseLibraryService(exercises, equipment, unitOfWork, deps),
  },
  {
    provide: ExportService,
    inject: [EXERCISES_REPOSITORY, WORKOUTS_REPOSITORY, PLANS_REPOSITORY, SESSIONS_REPOSITORY, BODY_WEIGHT_REPOSITORY],
    useFactory: (exercises, workouts, plans, sessions, bodyWeight) =>
      new ExportService(exercises, workouts, plans, sessions, bodyWeight),
  },
  {
    provide: PlanImportService,
    inject: [PLANS_REPOSITORY, WORKOUTS_REPOSITORY, EXERCISES_REPOSITORY, ATHLETES_REPOSITORY, UNIT_OF_WORK, DOMAIN_DEPS],
    useFactory: (plans, workouts, exercises, athletes, unitOfWork, deps) =>
      new PlanImportService(plans, workouts, exercises, athletes, unitOfWork, deps),
  },
  {
    provide: PlanService,
    inject: [PLANS_REPOSITORY, WORKOUTS_REPOSITORY, UNIT_OF_WORK, DOMAIN_DEPS],
    useFactory: (plans, workouts, unitOfWork, deps) => new PlanService(plans, workouts, unitOfWork, deps),
  },
  {
    provide: ProgressService,
    inject: [
      SESSIONS_REPOSITORY,
      EXERCISES_REPOSITORY,
      WORKOUTS_REPOSITORY,
      PLANS_REPOSITORY,
      BODY_WEIGHT_REPOSITORY,
      BODY_MEASUREMENTS_REPOSITORY,
    ],
    useFactory: (sessions, exercises, workouts, plans, bodyWeight, bodyMeasurements) =>
      new ProgressService(sessions, exercises, workouts, plans, bodyWeight, bodyMeasurements),
  },
  {
    provide: TrainingPlanService,
    inject: [PLANS_REPOSITORY, WORKOUTS_REPOSITORY, EXERCISES_REPOSITORY, EQUIPMENT_REPOSITORY, SESSIONS_REPOSITORY],
    useFactory: (plans, workouts, exercises, equipment, sessions) =>
      new TrainingPlanService(plans, workouts, exercises, equipment, sessions),
  },
  {
    provide: SessionService,
    inject: [SESSIONS_REPOSITORY, EXERCISES_REPOSITORY, TrainingPlanService, UNIT_OF_WORK, DOMAIN_DEPS],
    useFactory: (sessions, exercises, plans, unitOfWork, deps) =>
      new SessionService(sessions, exercises, plans, unitOfWork, deps),
  },
  {
    provide: WorkoutService,
    inject: [WORKOUTS_REPOSITORY, EXERCISES_REPOSITORY, EQUIPMENT_REPOSITORY, SESSIONS_REPOSITORY, UNIT_OF_WORK, DOMAIN_DEPS],
    useFactory: (workouts, exercises, equipment, sessions, unitOfWork, deps) =>
      new WorkoutService(workouts, exercises, equipment, sessions, unitOfWork, deps),
  },
  {
    provide: AdminService,
    inject: [ATHLETES_REPOSITORY, SESSIONS_REPOSITORY, ADMIN_ACTIONS_REPOSITORY, UNIT_OF_WORK, DOMAIN_DEPS],
    useFactory: (athletes, sessions, adminActions, unitOfWork, deps) =>
      new AdminService(athletes, sessions, adminActions, unitOfWork, deps),
  },
];

@Module({
  imports: [AuthModule, RepositoriesModule],
  providers: [{ provide: DOMAIN_DEPS, useValue: productionDeps }, ...services],
  exports: services,
})
export class ServicesModule {}
