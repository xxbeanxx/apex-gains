import { Inject, Injectable } from '@nestjs/common';

import type { Athlete } from '~/domain/athlete/athlete';
import { cardioFieldsFor } from '~/domain/equipment/cardio-fields';
import type { ExerciseType } from '~/domain/exercise/exercise-type';
import { suggestNextTarget, type RecentSession, type SuggestionKind } from '~/domain/progress/progression';
import type { LoggedSet } from '~/domain/session/logged-set';
import type { MoveDirection } from '~/domain/shared/ordered';
import { err, ok, type Result } from '~/domain/shared/result';
import { SetTarget } from '~/domain/workout/set-target';
import { Workout } from '~/domain/workout/workout';
import type { DateOnly } from '~/domain/values/date-only';
import { Duration } from '~/domain/values/duration';
import { Speed } from '~/domain/values/speed';
import type { WeightUnit } from '~/domain/values/units';
import { Weight } from '~/domain/values/weight';
import type { EquipmentRepository } from '~/repositories/equipment-repository.server';
import type { ExercisesRepository } from '~/repositories/exercises-repository.server';
import type { SessionsRepository } from '~/repositories/sessions-repository.server';
import type { WorkoutsRepository } from '~/repositories/workouts-repository.server';
import type { UnitOfWork } from '~/repositories/unit-of-work.server';
import {
  EQUIPMENT_REPOSITORY,
  EXERCISES_REPOSITORY,
  SESSIONS_REPOSITORY,
  WORKOUTS_REPOSITORY,
  UNIT_OF_WORK,
} from '~/repositories/tokens';
import { DOMAIN_DEPS } from '~/services/shared/tokens';

import type { DomainDeps } from './shared/deps.server';
import { nextCopyName } from './shared/duplicate-name';
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
  restSeconds?: number | null;
};

export type WorkoutMutation = ForkMutation;

/**
 * A progressive-overload proposal for one workout entry - never applied on
 * its own, only rendered with its reason and an Apply. `target` reuses
 * `TargetView`'s athlete-unit fields, since those are exactly what an
 * "apply" submission needs to post back through `updateExerciseTarget`.
 */
export type SuggestionView = {
  workoutExerciseId: string;
  kind: Exclude<SuggestionKind, 'hold'>;
  because: string;
  summary: string | null;
  target: TargetView;
};

/**
 * How many of an exercise's most recent logged sets to fetch before grouping
 * them into sessions. Generous enough to cover two sessions at a typical
 * set count; an exercise logged in unusually high volume in one sitting
 * could push an earlier qualifying set out of this window, understating
 * that session rather than overstating it.
 */
const RECENT_SET_FETCH_LIMIT = 20;

/** How many of an exercise's most recent sessions `suggestNextTarget` needs. */
const SESSIONS_NEEDED = 2;

/**
 * A PR1000's power rods (and comparable fixed-resistance equipment) move in
 * discrete steps, not a percentage of the current weight - 5 lb for an
 * athlete who trains in pounds, 2.5 kg for one who trains in kilograms.
 */
function weightIncrementFor(unit: WeightUnit): Weight {
  return unit === 'lb' ? Weight.lb(5) : Weight.kg(2.5);
}

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
    @Inject(SESSIONS_REPOSITORY) private readonly sessions: SessionsRepository,
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

  /**
   * A progressive-overload proposal for each targeted entry that has one -
   * an untargeted entry, or one with too little history, is simply absent
   * rather than holding a place with nothing to say. Never writes anything;
   * applying a suggestion is a separate call through `updateExerciseTarget`.
   */
  async suggestions(athlete: Athlete, workoutId: string): Promise<Map<string, SuggestionView>> {
    const workout = await this.workouts.findVisible(athlete.id, workoutId);
    const result = new Map<string, SuggestionView>();
    if (!workout) return result;

    const targeted = workout.exercises.filter((entry) => !entry.target.isEmpty);
    if (targeted.length === 0) return result;

    const directory = await ExerciseDirectory.of(
      targeted.map((entry) => entry.exerciseId),
      this.exercises,
    );
    const equipmentList = await this.equipment.findManyByIds(directory.allEquipmentIds);
    const equipmentById = new Map(equipmentList.map((item) => [item.id, item]));
    const weightIncrement = weightIncrementFor(athlete.preferences.weightUnit);

    for (const entry of targeted) {
      const cardioFields = cardioFieldsFor(
        directory.equipmentIdsOf(entry.exerciseId).map((id) => equipmentById.get(id)?.cardioKind ?? null),
      );
      const recent = await this.recentSessionsFor(athlete.id, entry.exerciseId);

      const suggestion = suggestNextTarget(
        entry.target,
        recent,
        directory.typeOf(entry.exerciseId),
        cardioFields,
        weightIncrement,
      );
      if (!suggestion || suggestion.kind === 'hold') continue;

      result.set(entry.id, {
        workoutExerciseId: entry.id,
        kind: suggestion.kind,
        because: suggestion.because,
        summary: suggestion.target.format(athlete.preferences),
        target: toTargetView(suggestion.target, athlete.preferences)!,
      });
    }

    return result;
  }

  /**
   * The exercise's most recent sessions, most-recent-first, each carrying
   * every set logged for it that day - grouped from a flat, newest-first set
   * list rather than a third query shape over the same rows (see
   * `RECENT_SET_FETCH_LIMIT` for the trade-off that makes this one query
   * enough).
   */
  private async recentSessionsFor(userId: string, exerciseId: string): Promise<RecentSession[]> {
    const found = await this.sessions.recentSetsForExercise(userId, exerciseId, RECENT_SET_FETCH_LIMIT);

    const sessions: { date: DateOnly; sets: LoggedSet[] }[] = [];
    const byDate = new Map<string, { date: DateOnly; sets: LoggedSet[] }>();
    for (const { date, set } of found) {
      let session = byDate.get(date.value);
      if (!session) {
        if (sessions.length >= SESSIONS_NEEDED) continue;
        session = { date, sets: [] };
        byDate.set(date.value, session);
        sessions.push(session);
      }
      session.sets.push(set);
    }

    return sessions;
  }

  async create(athlete: Athlete, name: string): Promise<WorkoutSummary> {
    const workout = Workout.create(athlete.id, name, this.deps);
    await this.unitOfWork.run(() => this.workouts.save(workout));
    return toSummary(workout);
  }

  /**
   * A personal, editable copy of any workout the athlete can see - their
   * own, or a sample. Built on `copyForImport`, the same deep copy a shared
   * link's import uses, with the source's own exercise ids passed straight
   * through rather than resolved through another athlete's library.
   *
   * Deliberately not a fork: duplicating a sample gives a plain row with
   * `forkedFromId` null - no revert, and no effect on whether the sample
   * still appears in the athlete's list. That is a different action from
   * *editing* a sample, which forks it; the two sit side by side in the
   * list's row menu.
   */
  async duplicate(athlete: Athlete, workoutId: string): Promise<Result<{ id: string }, 'not-found'>> {
    return this.unitOfWork.run(async () => {
      const source = await this.workouts.findVisible(athlete.id, workoutId);
      if (!source) return err('not-found' as const);

      const names = await this.workouts.listNamesFor(athlete.id, athlete.preferences.showSampleData);
      const name = nextCopyName(source.name, new Set(names.map((found) => found.name)));

      const copy = source.copyForImport(athlete.id, (exerciseId) => exerciseId, this.deps);
      copy.rename(name, this.deps.clock.now());

      await this.workouts.save(copy);
      return ok({ id: copy.id });
    });
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
      rest: input.restSeconds != null ? Duration.seconds(input.restSeconds) : null,
    });
  }
}
