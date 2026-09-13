import { InMemoryAdminActionsRepository } from '~infrastructure/persistence/in-memory/admin-actions-repository';
import { InMemoryAthletesRepository } from '~infrastructure/persistence/in-memory/athletes-repository';
import { InMemoryBodyMeasurementsRepository } from '~infrastructure/persistence/in-memory/body-measurements-repository';
import { InMemoryBodyWeightRepository } from '~infrastructure/persistence/in-memory/body-weight-repository';
import { InMemoryEquipmentRepository } from '~infrastructure/persistence/in-memory/equipment-repository';
import { InMemoryExercisesRepository } from '~infrastructure/persistence/in-memory/exercises-repository';
import { InMemoryPlansRepository } from '~infrastructure/persistence/in-memory/plans-repository';
import { InMemorySessionsRepository } from '~infrastructure/persistence/in-memory/sessions-repository';
import { InMemoryUnitOfWork } from '~infrastructure/persistence/in-memory/unit-of-work';
import { InMemoryWorkoutsRepository } from '~infrastructure/persistence/in-memory/workouts-repository';

/**
 * Every in-memory adapter, as one set.
 */
export type InMemoryRepositories = {
  readonly adminActions: InMemoryAdminActionsRepository;
  readonly athletes: InMemoryAthletesRepository;
  readonly bodyMeasurements: InMemoryBodyMeasurementsRepository;
  readonly bodyWeight: InMemoryBodyWeightRepository;
  readonly equipment: InMemoryEquipmentRepository;
  readonly exercises: InMemoryExercisesRepository;
  readonly plans: InMemoryPlansRepository;
  readonly sessions: InMemorySessionsRepository;
  readonly workouts: InMemoryWorkoutsRepository;
  readonly unitOfWork: InMemoryUnitOfWork;
};

/**
 * A fresh, empty in-memory family, wired the way the schema is.
 *
 * Separate `Map`s carry no foreign keys, so the three things Postgres does
 * for the adapters (see `./references.ts`) only happen once each store is
 * named to the ones that point at it: refusing to delete an exercise a
 * workout or a logged set still names (`on delete restrict`), taking an
 * account's rows with it (`on delete cascade`), and keeping the audit trail
 * while forgetting who it named (`on delete set null`). A store constructed
 * on its own has none of that and will quietly allow what Postgres refuses,
 * so this is how the Nest module, the persistence contract and the service
 * tests all build theirs - one call, and the wiring cannot be left out.
 */
export function inMemoryRepositories(): InMemoryRepositories {
  const adminActions = new InMemoryAdminActionsRepository();
  const athletes = new InMemoryAthletesRepository();
  const bodyMeasurements = new InMemoryBodyMeasurementsRepository();
  const bodyWeight = new InMemoryBodyWeightRepository();
  const equipment = new InMemoryEquipmentRepository();
  const exercises = new InMemoryExercisesRepository();
  const plans = new InMemoryPlansRepository();
  const sessions = new InMemorySessionsRepository();
  const workouts = new InMemoryWorkoutsRepository();

  exercises.referencedBy(workouts, sessions);
  athletes.ownedBy(exercises, workouts, plans, sessions, bodyWeight, bodyMeasurements);
  athletes.referencedBy(adminActions);

  return {
    adminActions,
    athletes,
    bodyMeasurements,
    bodyWeight,
    equipment,
    exercises,
    plans,
    sessions,
    workouts,
    unitOfWork: new InMemoryUnitOfWork(),
  };
}
