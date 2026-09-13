import { Module, type Provider } from '@nestjs/common';
import { productionDeps } from '~application/ports/domain-deps';
import { AthleteCalendar } from '~application/shared/athlete-calendar';
import { DaySchedule } from '~application/shared/day-schedule';
import { ReferenceDirectory } from '~application/shared/reference-directory';
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
import { AuthModule } from '~server/auth/auth.module';
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
import { RepositoriesModule } from '~server/repositories/repositories.module';

/**
 * Shared by the use cases that render a referenced exercise or workout, and
 * never handed to a route - so it is provided here but not exported.
 */
const referenceDirectory: Provider = {
  provide: ReferenceDirectory,
  inject: [EXERCISES_REPOSITORY, WORKOUTS_REPOSITORY, EQUIPMENT_REPOSITORY],
  useFactory: (exercises, workouts, equipment) => new ReferenceDirectory(exercises, workouts, equipment),
};

/**
 * One reading of the active plan's cycle, shared by the use case that renders
 * a day and the one that snapshots it into a session. Not exported, for the
 * same reason as `referenceDirectory`.
 */
const daySchedule: Provider = {
  provide: DaySchedule,
  inject: [PLANS_REPOSITORY, ReferenceDirectory],
  useFactory: (plans, references) => new DaySchedule(plans, references),
};

const services: Provider[] = [
  {
    provide: AthleteCalendar,
    inject: [DOMAIN_DEPS],
    useFactory: (deps) => new AthleteCalendar(deps.clock),
  },
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
    inject: [
      EXERCISES_REPOSITORY,
      WORKOUTS_REPOSITORY,
      ReferenceDirectory,
      PLANS_REPOSITORY,
      SESSIONS_REPOSITORY,
      BODY_WEIGHT_REPOSITORY,
      DOMAIN_DEPS,
    ],
    useFactory: (exercises, workouts, references, plans, sessions, bodyWeight, deps) =>
      new ExportService(exercises, workouts, references, plans, sessions, bodyWeight, deps.clock),
  },
  {
    provide: PlanImportService,
    inject: [PLANS_REPOSITORY, WORKOUTS_REPOSITORY, EXERCISES_REPOSITORY, ATHLETES_REPOSITORY, UNIT_OF_WORK, DOMAIN_DEPS],
    useFactory: (plans, workouts, exercises, athletes, unitOfWork, deps) =>
      new PlanImportService(plans, workouts, exercises, athletes, unitOfWork, deps),
  },
  {
    provide: PlanService,
    inject: [PLANS_REPOSITORY, ReferenceDirectory, UNIT_OF_WORK, DOMAIN_DEPS],
    useFactory: (plans, references, unitOfWork, deps) => new PlanService(plans, references, unitOfWork, deps),
  },
  {
    provide: ProgressService,
    inject: [
      SESSIONS_REPOSITORY,
      ReferenceDirectory,
      PLANS_REPOSITORY,
      BODY_WEIGHT_REPOSITORY,
      BODY_MEASUREMENTS_REPOSITORY,
      AthleteCalendar,
    ],
    useFactory: (sessions, references, plans, bodyWeight, bodyMeasurements, calendar) =>
      new ProgressService(sessions, references, plans, bodyWeight, bodyMeasurements, calendar),
  },
  {
    provide: TrainingPlanService,
    inject: [DaySchedule, ReferenceDirectory, SESSIONS_REPOSITORY],
    useFactory: (schedule, references, sessions) => new TrainingPlanService(schedule, references, sessions),
  },
  {
    provide: SessionService,
    inject: [SESSIONS_REPOSITORY, EXERCISES_REPOSITORY, ReferenceDirectory, DaySchedule, UNIT_OF_WORK, DOMAIN_DEPS],
    useFactory: (sessions, exercises, references, schedule, unitOfWork, deps) =>
      new SessionService(sessions, exercises, references, schedule, unitOfWork, deps),
  },
  {
    provide: WorkoutService,
    inject: [WORKOUTS_REPOSITORY, EXERCISES_REPOSITORY, ReferenceDirectory, SESSIONS_REPOSITORY, UNIT_OF_WORK, DOMAIN_DEPS],
    useFactory: (workouts, exercises, references, sessions, unitOfWork, deps) =>
      new WorkoutService(workouts, exercises, references, sessions, unitOfWork, deps),
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
  providers: [{ provide: DOMAIN_DEPS, useValue: productionDeps }, referenceDirectory, daySchedule, ...services],
  exports: services,
})
export class ServicesModule {}
