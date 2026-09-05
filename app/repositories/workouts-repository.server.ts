import type { Workout } from '~/domain/workout/workout';

// Port: consumers depend on this interface, not on Drizzle/Postgres
// directly. `server/repositories/repositories.module.ts` picks which
// adapter backs it.
//
// `save` persists the whole aggregate - the workout row and its exercise
// entries - as one unit, so an adapter has to work out which entries were
// added, changed or dropped (see shared/diff-children.ts).
/** Just enough of a workout to label a plan slot or fill a picker. */
export type WorkoutName = {
  readonly id: string;
  readonly name: string;
};

export interface WorkoutsRepository {
  listFor(userId: string, showSampleData: boolean): Promise<Workout[]>;
  /**
   * The same set as `listFor`, but names only.
   *
   * Resolving a plan slot's `workoutId` to something displayable does not
   * need the workout's exercise entries, and hydrating a whole aggregate per
   * slot to read one string is the kind of cost that only shows up once the
   * library is large. Callers that render a name go through this.
   */
  listNamesFor(userId: string, showSampleData: boolean): Promise<WorkoutName[]>;
  findVisible(userId: string, workoutId: string): Promise<Workout | null>;
  /**
   * Exactly these workouts, ignoring visibility - the counterpart to
   * `ExercisesRepository.findManyByIds`.
   *
   * Importing a shared plan has to read the workouts its slots name, and
   * those belong to the athlete who shared it. Reaching them is gated by the
   * share token the caller already resolved, not by this method.
   */
  findManyByIds(workoutIds: readonly string[]): Promise<Workout[]>;
  findForkOf(userId: string, sampleId: string): Promise<Workout | null>;
  save(workout: Workout): Promise<void>;
  delete(workoutId: string): Promise<void>;
}
