import type { DomainDeps } from '~application/ports/domain-deps';
import type { EquipmentRepository } from '~application/ports/persistence/equipment-repository';
import type { ExercisesRepository } from '~application/ports/persistence/exercises-repository';
import type { UnitOfWork } from '~application/ports/persistence/unit-of-work';
import { type ForkMutation, ForkableEditor } from '~application/shared/fork';
import type { Athlete } from '~domain/athlete/athlete';
import { type CardioFields, cardioFieldsFor } from '~domain/equipment/cardio-fields';
import { type CardioKind, Equipment } from '~domain/equipment/equipment';
import { Exercise, type ExerciseDetails } from '~domain/exercise/exercise';
import type { ExerciseType } from '~domain/exercise/exercise-type';
import { type Result, err, ok } from '~domain/shared/result';

export type EquipmentView = {
  id: string;
  name: string;
  isSample: boolean;
  cardioKind: CardioKind | null;
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
  /** Which cardio measurements a target or log form should offer - see `cardioFieldsFor`. */
  cardioFields: CardioFields;
};

export type LibraryView = {
  exercises: ExerciseView[];
  equipment: EquipmentView[];
};

export type ExerciseMutation = Result<{ forkedId: string | null }, 'not-found' | 'duplicate-name'>;

function toView(exercise: Exercise, equipmentById: ReadonlyMap<string, EquipmentView>): ExerciseView {
  const equipment = exercise.equipmentIds
    .map((id) => equipmentById.get(id))
    .filter((item): item is EquipmentView => item !== undefined);

  return {
    id: exercise.id,
    name: exercise.name,
    exerciseType: exercise.exerciseType,
    muscleGroup: exercise.muscleGroup,
    description: exercise.description,
    isSample: exercise.ownership.isSample,
    canRevert: exercise.canRevert,
    equipment,
    cardioFields: cardioFieldsFor(equipment.map((item) => item.cardioKind)),
  };
}

function toEquipmentView(item: Equipment): EquipmentView {
  return {
    id: item.id,
    name: item.name,
    isSample: item.ownership.isSample,
    cardioKind: item.cardioKind,
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
    private readonly deps: DomainDeps,
  ) {
    // Equipment links carry no position, so fork translation is the identity.
    this.editor = new ForkableEditor(this.exercises, this.unitOfWork, this.deps, () => []);
  }

  /** Load, fork if needed, apply, save - see `shared/fork.server.ts`. */
  private readonly editor: ForkableEditor<Exercise>;

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
    const exercises = await this.exercises.listFor(athlete.id, athlete.preferences.showSampleData);
    return this.viewsFor(exercises);
  }

  /**
   * Resolves each exercise's equipment links to names in one lookup, keyed
   * by id rather than by the athlete's visible list - an exercise can link
   * sample equipment that their preferences hide from the equipment list.
   */
  private async viewsFor(exercises: readonly Exercise[]): Promise<ExerciseView[]> {
    const ids = new Set<string>();
    for (const exercise of exercises) {
      for (const id of exercise.equipmentIds) ids.add(id);
    }

    const equipment = await this.equipment.findManyByIds([...ids]);
    const byId = new Map(equipment.map((item) => [item.id, toEquipmentView(item)]));

    return exercises.map((exercise) => toView(exercise, byId));
  }

  async createExercise(athlete: Athlete, details: ExerciseDetails): Promise<Result<{ id: string }, 'duplicate-name'>> {
    return this.unitOfWork.run(async () => {
      const clash = await this.exercises.findOwnByName(athlete.id, details.name);
      if (clash) return err('duplicate-name' as const);

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
  async updateExercise(athlete: Athlete, exerciseId: string, details: ExerciseDetails): Promise<ExerciseMutation> {
    return this.editor.edit(athlete.id, exerciseId, async (copy) => {
      const clash = await this.exercises.findOwnByName(athlete.id, details.name);
      if (clash && clash.id !== copy.editable.id) {
        return err('duplicate-name' as const);
      }

      copy.editable.updateDetails(details);
      await this.exercises.save(copy.editable);
      return ok();
    });
  }

  async setExerciseEquipment(
    athlete: Athlete,
    exerciseId: string,
    equipmentId: string,
    linked: boolean,
  ): Promise<ForkMutation> {
    return this.editor.mutate(athlete.id, exerciseId, (exercise) => exercise.setEquipment(equipmentId, linked));
  }

  /**
   * Discards a personal customisation so the shared original applies again.
   * Refused when a workout or a logged set still points at the copy - the
   * FK is `on delete restrict` so that history can't be rewritten by a
   * revert.
   */
  async revertExercise(athlete: Athlete, exerciseId: string): Promise<Result<void, 'nothing-to-revert' | 'in-use'>> {
    return this.unitOfWork.run(async () => {
      const exercise = await this.exercises.findVisible(athlete.id, exerciseId);
      if (!exercise || !exercise.canRevert) {
        return err('nothing-to-revert' as const);
      }

      const outcome = await this.exercises.delete(exercise.id);
      return outcome === 'in-use' ? err('in-use' as const) : ok();
    });
  }

  /**
   * Equipment names are globally unique, so adding one that already exists
   * is a no-op rather than an error - the athlete ends up looking at the
   * same list either way.
   */
  async addEquipment(athlete: Athlete, name: string, cardioKind: CardioKind | null = null): Promise<void> {
    await this.unitOfWork.run(async () => {
      const existing = await this.equipment.findByName(name);
      if (existing) return;
      await this.equipment.save(Equipment.create(athlete.id, name, cardioKind, this.deps));
    });
  }

  /** Silently ignores equipment the athlete doesn't own, samples included. */
  async removeEquipment(athlete: Athlete, equipmentId: string): Promise<void> {
    await this.unitOfWork.run(async () => {
      const item = await this.equipment.findById(equipmentId);
      if (!item || !item.isRemovableBy(athlete.id)) return;
      await this.equipment.delete(item.id);
    });
  }

  /** Silently ignores equipment the athlete doesn't own, samples included - see removeEquipment. */
  async setEquipmentCardioKind(athlete: Athlete, equipmentId: string, cardioKind: CardioKind | null): Promise<void> {
    await this.unitOfWork.run(async () => {
      const item = await this.equipment.findById(equipmentId);
      if (!item || !item.isRemovableBy(athlete.id)) return;
      item.setCardioKind(cardioKind);
      await this.equipment.save(item);
    });
  }
}
