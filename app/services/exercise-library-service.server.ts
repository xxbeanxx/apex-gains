import type { Athlete } from "~/domain/athlete/athlete";
import { Equipment } from "~/domain/equipment/equipment";
import { Exercise, type ExerciseDetails } from "~/domain/exercise/exercise";
import type { ExerciseType } from "~/domain/exercise/exercise-type";
import { err, ok, type Result } from "~/domain/shared/result";
import type { EquipmentRepository } from "~/repositories/equipment-repository";
import { getEquipmentRepository } from "~/repositories/equipment-repository.server";
import type { ExercisesRepository } from "~/repositories/exercises-repository";
import { getExercisesRepository } from "~/repositories/exercises-repository.server";
import type { UnitOfWork } from "~/repositories/unit-of-work";
import { getUnitOfWork } from "~/repositories/unit-of-work.server";

import { productionDeps, type DomainDeps } from "./shared/deps.server";
import { resolveEditableCopy } from "./shared/fork.server";

export type EquipmentView = {
  id: string;
  name: string;
  isSample: boolean;
};

export type ExerciseView = {
  id: string;
  name: string;
  exerciseType: ExerciseType;
  muscleGroup: string | null;
  description: string | null;
  isSample: boolean;
  canRevert: boolean;
  /** Resolved names, because the library page searches and filters by them. */
  equipment: EquipmentView[];
};

export type LibraryView = {
  exercises: ExerciseView[];
  equipment: EquipmentView[];
};

export type ExerciseMutation = Result<
  { forkedId: string | null },
  "not-found" | "duplicate-name"
>;

function toView(
  exercise: Exercise,
  equipmentById: ReadonlyMap<string, EquipmentView>,
): ExerciseView {
  return {
    id: exercise.id,
    name: exercise.name,
    exerciseType: exercise.exerciseType,
    muscleGroup: exercise.muscleGroup,
    description: exercise.description,
    isSample: exercise.ownership.isSample,
    canRevert: exercise.canRevert,
    equipment: exercise.equipmentIds
      .map((id) => equipmentById.get(id))
      .filter((item): item is EquipmentView => item !== undefined),
  };
}

function toEquipmentView(item: Equipment): EquipmentView {
  return {
    id: item.id,
    name: item.name,
    isSample: item.ownership.isSample,
  };
}

/**
 * Use cases for the exercise library and the equipment it is built around.
 *
 * Exercises and equipment are separate aggregates but always shown together,
 * so one service covers both rather than the route orchestrating two.
 */
export class ExerciseLibraryService {
  constructor(
    private readonly exercises: ExercisesRepository,
    private readonly equipment: EquipmentRepository,
    private readonly unitOfWork: UnitOfWork,
    private readonly deps: DomainDeps = productionDeps,
  ) {}

  async library(athlete: Athlete): Promise<LibraryView> {
    const showSamples = athlete.preferences.showSampleData;
    const [exercises, equipment] = await Promise.all([
      this.exercises.listFor(athlete.id, showSamples),
      this.equipment.listFor(athlete.id, showSamples),
    ]);

    return {
      exercises: await this.viewsFor(exercises),
      equipment: equipment.map(toEquipmentView),
    };
  }

  async listExercises(athlete: Athlete): Promise<ExerciseView[]> {
    const exercises = await this.exercises.listFor(
      athlete.id,
      athlete.preferences.showSampleData,
    );
    return this.viewsFor(exercises);
  }

  /**
   * Resolves each exercise's equipment links to names in one lookup, keyed
   * by id rather than by the athlete's visible list - an exercise can link
   * sample equipment that their preferences hide from the equipment list.
   */
  private async viewsFor(
    exercises: readonly Exercise[],
  ): Promise<ExerciseView[]> {
    const ids = new Set<string>();
    for (const exercise of exercises) {
      for (const id of exercise.equipmentIds) ids.add(id);
    }

    const equipment = await this.equipment.findManyByIds([...ids]);
    const byId = new Map(
      equipment.map((item) => [item.id, toEquipmentView(item)]),
    );

    return exercises.map((exercise) => toView(exercise, byId));
  }

  async createExercise(
    athlete: Athlete,
    details: ExerciseDetails,
  ): Promise<Result<{ id: string }, "duplicate-name">> {
    return this.unitOfWork.run(async () => {
      const clash = await this.exercises.findOwnByName(
        athlete.id,
        details.name,
      );
      if (clash) return err("duplicate-name" as const);

      const exercise = Exercise.create(athlete.id, details, this.deps);
      await this.exercises.save(exercise);
      return ok({ id: exercise.id });
    });
  }

  /**
   * Editing a sample forks it first, so the shared original is left intact -
   * which is also why the duplicate-name check has to exclude the copy being
   * edited: renaming an exercise to what it is already called is not a clash.
   */
  async updateExercise(
    athlete: Athlete,
    exerciseId: string,
    details: ExerciseDetails,
  ): Promise<ExerciseMutation> {
    return this.unitOfWork.run(async () => {
      const loaded = await this.exercises.findVisible(athlete.id, exerciseId);
      if (!loaded) return err("not-found" as const);

      const copy = await this.editableCopy(loaded, athlete);

      const clash = await this.exercises.findOwnByName(
        athlete.id,
        details.name,
      );
      if (clash && clash.id !== copy.editable.id) {
        return err("duplicate-name" as const);
      }

      copy.editable.updateDetails(details);
      await this.exercises.save(copy.editable);
      return ok({ forkedId: copy.forkedId });
    });
  }

  async setExerciseEquipment(
    athlete: Athlete,
    exerciseId: string,
    equipmentId: string,
    linked: boolean,
  ): Promise<Result<{ forkedId: string | null }, "not-found">> {
    return this.unitOfWork.run(async () => {
      const loaded = await this.exercises.findVisible(athlete.id, exerciseId);
      if (!loaded) return err("not-found" as const);

      const copy = await this.editableCopy(loaded, athlete);
      copy.editable.setEquipment(equipmentId, linked);
      await this.exercises.save(copy.editable);
      return ok({ forkedId: copy.forkedId });
    });
  }

  /**
   * Discards a personal customisation so the shared original applies again.
   * Refused when a template or a logged set still points at the copy - the
   * FK is `on delete restrict` so that history can't be rewritten by a
   * revert.
   */
  async revertExercise(
    athlete: Athlete,
    exerciseId: string,
  ): Promise<Result<void, "nothing-to-revert" | "in-use">> {
    return this.unitOfWork.run(async () => {
      const exercise = await this.exercises.findVisible(athlete.id, exerciseId);
      if (!exercise || !exercise.canRevert) {
        return err("nothing-to-revert" as const);
      }

      const outcome = await this.exercises.delete(exercise.id);
      return outcome === "in-use" ? err("in-use" as const) : ok();
    });
  }

  /**
   * Equipment names are globally unique, so adding one that already exists
   * is a no-op rather than an error - the athlete ends up looking at the
   * same list either way.
   */
  async addEquipment(athlete: Athlete, name: string): Promise<void> {
    await this.unitOfWork.run(async () => {
      const existing = await this.equipment.findByName(name);
      if (existing) return;
      await this.equipment.save(
        Equipment.create(athlete.id, name, this.deps),
      );
    });
  }

  /** Silently ignores equipment the athlete doesn't own, samples included. */
  async removeEquipment(
    athlete: Athlete,
    equipmentId: string,
  ): Promise<void> {
    await this.unitOfWork.run(async () => {
      const item = await this.equipment.findById(equipmentId);
      if (!item || !item.isRemovableBy(athlete.id)) return;
      await this.equipment.delete(item.id);
    });
  }

  private editableCopy(exercise: Exercise, athlete: Athlete) {
    return resolveEditableCopy(
      exercise,
      athlete.id,
      this.deps,
      (sampleId) => this.exercises.findForkOf(athlete.id, sampleId),
      // Equipment links carry no position; fork translation is the identity.
      () => [],
    );
  }
}

let service: ExerciseLibraryService | undefined;

export async function getExerciseLibraryService(): Promise<ExerciseLibraryService> {
  if (!service) {
    service = new ExerciseLibraryService(
      await getExercisesRepository(),
      await getEquipmentRepository(),
      await getUnitOfWork(),
    );
  }
  return service;
}
