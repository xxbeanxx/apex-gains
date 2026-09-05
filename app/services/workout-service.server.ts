import { Inject, Injectable } from '@nestjs/common';

import type { Athlete } from '~/domain/athlete/athlete';
import { cardioFieldsFor } from '~/domain/equipment/cardio-fields';
import type { ExerciseType } from '~/domain/exercise/exercise-type';
import type { MoveDirection } from '~/domain/shared/ordered';
import { err, ok, type Result } from '~/domain/shared/result';
import { SetTarget } from '~/domain/workout/set-target';
import { Workout } from '~/domain/workout/workout';
import { Duration } from '~/domain/values/duration';
import { Speed } from '~/domain/values/speed';
import { Weight } from '~/domain/values/weight';
import type { EquipmentRepository } from '~/repositories/equipment-repository.server';
import type { ExercisesRepository } from '~/repositories/exercises-repository.server';
import type { WorkoutsRepository } from '~/repositories/workouts-repository.server';
import type { UnitOfWork } from '~/repositories/unit-of-work.server';
import { EQUIPMENT_REPOSITORY, EXERCISES_REPOSITORY, WORKOUTS_REPOSITORY, UNIT_OF_WORK } from '~/repositories/tokens';
import { DOMAIN_DEPS } from '~/services/shared/tokens';

import type { DomainDeps } from './shared/deps.server';
import { ExerciseDirectory } from './shared/exercise-directory.server';
import { ForkableLibrary, type ForkMutation } from './shared/fork.server';
import { toTargetView, type TargetView } from './shared/target-view.server';

export type WorkoutSummary = {
  id: string;
  name: string;
  isSample: boolean;
  /** A personal copy of a sample - shown as "Customized" rather than "Sample". */
  isCustomized: boolean;
  exerciseCount: number;
};

export type WorkoutExerciseView = {
  id: string;
  position: number;
  exerciseId: string;
  exerciseName: string;
  exerciseType: ExerciseType;
  /** Already formatted in the athlete's units; null when nothing is targeted. */
  targetSummary: string | null;
  /**
   * The same target, broken into chips ("3 sets", "8 reps", "135 lb"); a
   * field is null when untargeted. The `*Value` fields carry the bare
   * number behind each formatted string, in the athlete's own units, for
   * an edit form's number input - `weight`/`duration`/`speed` alone are
   * display strings a form can't parse back into one.
   */
  target: TargetView | null;
};

export type WorkoutDetail = WorkoutSummary & {
  canRevert: boolean;
  isDeletable: boolean;
  exercises: WorkoutExerciseView[];
};

/**
 * Targets as the athlete typed them: weight in their weight unit, speed in
 * their distance unit, duration in minutes. Converting to the canonical
 * storage units is this service's job, not the form's.
 */
export type TargetInput = {
  sets?: number | null;
  reps?: number | null;
  weight?: number | null;
  durationMinutes?: number | null;
  speed?: number | null;
  resistance?: number | null;
};

export type WorkoutMutation = ForkMutation;

function toSummary(workout: Workout): WorkoutSummary {
  return {
    id: workout.id,
    name: workout.name,
    isSample: workout.ownership.isSample,
    isCustomized: workout.canRevert,
    exerciseCount: workout.exerciseCount,
  };
}

/** Use cases for building the reusable workouts a plan schedules. */
@Injectable()
export class WorkoutService {
  constructor(
    @Inject(WORKOUTS_REPOSITORY) private readonly workouts: WorkoutsRepository,
    @Inject(EXERCISES_REPOSITORY) private readonly exercises: ExercisesRepository,
    @Inject(EQUIPMENT_REPOSITORY) private readonly equipment: EquipmentRepository,
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: UnitOfWork,
    @Inject(DOMAIN_DEPS) private readonly deps: DomainDeps,
  ) {
    this.editor = new ForkableLibrary(this.workouts, this.unitOfWork, this.deps, (workout) => workout.exercises);
  }

  /** Load, fork if needed, apply, save - see `shared/fork.server.ts`. */
  private readonly editor: ForkableLibrary<Workout>;

  async list(athlete: Athlete): Promise<WorkoutSummary[]> {
    const workouts = await this.workouts.listFor(athlete.id, athlete.preferences.showSampleData);
    return workouts.map(toSummary);
  }

  /** Sorted by name - what the plan editor's workout picker offers. */
  async listForPicker(athlete: Athlete): Promise<WorkoutSummary[]> {
    return (await this.list(athlete)).sort((a, b) => a.name.localeCompare(b.name));
  }

  async detail(athlete: Athlete, workoutId: string): Promise<WorkoutDetail | null> {
    const workout = await this.workouts.findVisible(athlete.id, workoutId);
    if (!workout) return null;

    // By id rather than by the athlete's library: an entry can point at a
    // sample they have since forked away from, which their library hides.
    const directory = await ExerciseDirectory.of(
      workout.exercises.map((entry) => entry.exerciseId),
      this.exercises,
    );

    return {
      ...toSummary(workout),
      canRevert: workout.canRevert,
      isDeletable: workout.isDeletable,
      exercises: workout.exercises.map((entry) => ({
        id: entry.id,
        position: entry.position,
        exerciseId: entry.exerciseId,
        exerciseName: directory.nameOf(entry.exerciseId),
        exerciseType: directory.typeOf(entry.exerciseId),
        targetSummary: entry.target.format(athlete.preferences),
        target: toTargetView(entry.target, athlete.preferences),
      })),
    };
  }

  async create(athlete: Athlete, name: string): Promise<WorkoutSummary> {
    const workout = Workout.create(athlete.id, name, this.deps);
    await this.unitOfWork.run(() => this.workouts.save(workout));
    return toSummary(workout);
  }

  async rename(athlete: Athlete, workoutId: string, name: string): Promise<WorkoutMutation> {
    return this.editor.mutate(athlete.id, workoutId, (workout) => workout.rename(name, this.deps.clock.now()));
  }

  async addExercise(
    athlete: Athlete,
    workoutId: string,
    exerciseId: string,
    input: TargetInput,
  ): Promise<Result<{ forkedId: string | null }, 'not-found' | 'exercise-not-found'>> {
    return this.editor.edit(athlete.id, workoutId, async (copy) => {
      const exercise = await this.exercises.findVisible(athlete.id, exerciseId);
      if (!exercise) return err('exercise-not-found' as const);

      copy.editable.addExercise(exerciseId, this.toTarget(athlete, input), this.deps);
      await this.workouts.save(copy.editable);
      return ok();
    });
  }

  /** Replaces one entry's target in place - editing a sample forks it first, same as every other mutation here. */
  async updateExerciseTarget(
    athlete: Athlete,
    workoutId: string,
    entryId: string,
    input: TargetInput,
  ): Promise<WorkoutMutation> {
    return this.editor.edit(athlete.id, workoutId, async (copy) => {
      const translatedId = copy.translateChildId(entryId);
      const entry = copy.editable.exercises.find((item) => item.id === translatedId);
      // A stale form naming a since-removed entry is a no-op, same as
      // removeExercise/moveExercise - not an error worth surfacing.
      if (!entry) return ok();

      const exercise = await this.exercises.findVisible(athlete.id, entry.exerciseId);
      const equipment = await this.equipment.findManyByIds(exercise?.equipmentIds ?? []);
      const cardioFields = cardioFieldsFor(equipment.map((item) => item.cardioKind));

      copy.editable.updateTarget(translatedId, this.toTarget(athlete, input), cardioFields, this.deps.clock.now());
      await this.workouts.save(copy.editable);
      return ok();
    });
  }

  async removeExercise(athlete: Athlete, workoutId: string, entryId: string): Promise<WorkoutMutation> {
    return this.editor.mutate(athlete.id, workoutId, (workout, translate) =>
      workout.removeExercise(translate(entryId), this.deps.clock.now()),
    );
  }

  async moveExercise(athlete: Athlete, workoutId: string, entryId: string, direction: MoveDirection): Promise<WorkoutMutation> {
    return this.editor.mutate(athlete.id, workoutId, (workout, translate) =>
      workout.moveExercise(translate(entryId), direction, this.deps.clock.now()),
    );
  }

  async remove(athlete: Athlete, workoutId: string): Promise<Result<void, 'not-found' | 'sample'>> {
    return this.editor.remove(athlete.id, workoutId);
  }

  /** See `ForkableLibrary.revert` - the caller redirects to the original. */
  async revert(
    athlete: Athlete,
    workoutId: string,
  ): Promise<Result<{ forkedFromId: string }, 'not-found' | 'nothing-to-revert'>> {
    return this.editor.revert(athlete.id, workoutId);
  }

  /** Where the athlete's chosen units are converted to canonical storage. */
  private toTarget(athlete: Athlete, input: TargetInput): SetTarget {
    const { weightUnit, distanceUnit } = athlete.preferences;
    return SetTarget.of({
      sets: input.sets,
      reps: input.reps,
      weight: input.weight != null ? Weight.in(weightUnit, input.weight) : null,
      duration: input.durationMinutes != null ? Duration.minutes(input.durationMinutes) : null,
      speed: input.speed != null ? Speed.in(distanceUnit, input.speed) : null,
      resistance: input.resistance,
    });
  }
}
