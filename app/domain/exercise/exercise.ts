import type { Clock } from '../shared/clock';
import { alreadyEditable, type EditableCopy, identityTranslation } from '../shared/forking';
import type { IdGenerator } from '../shared/ids';
import { Ownership } from '../shared/ownership';
import type { ExerciseType } from './exercise-type';

export type ExerciseDetails = {
  readonly name: string;
  readonly exerciseType: ExerciseType;
  readonly muscleGroup: string | null;
  readonly description: string | null;
};

export type ExerciseSnapshot = {
  readonly id: string;
  readonly userId: string | null;
  readonly forkedFromId: string | null;
  readonly name: string;
  readonly exerciseType: ExerciseType;
  readonly muscleGroup: string | null;
  readonly description: string | null;
  readonly createdAt: Date;
  readonly equipmentIds: readonly string[];
};

/**
 * A movement in the library, together with the equipment it needs.
 *
 * The equipment links are part of this aggregate rather than a relationship
 * between two roots: they have no identity or lifecycle of their own, and
 * forking an exercise has to copy them, so they belong inside its boundary.
 * The `equipment` rows themselves are a separate root.
 */
export class Exercise {
  private constructor(
    readonly id: string,
    readonly ownership: Ownership,
    private forkedFrom: string | null,
    private details: ExerciseDetails,
    readonly createdAt: Date,
    private readonly equipment: Set<string>,
  ) {}

  static create(userId: string, details: ExerciseDetails, deps: { ids: IdGenerator; clock: Clock }): Exercise {
    return new Exercise(deps.ids.next(), Ownership.of(userId), null, details, deps.clock.now(), new Set());
  }

  static fromSnapshot(snapshot: ExerciseSnapshot): Exercise {
    return new Exercise(
      snapshot.id,
      Ownership.fromUserId(snapshot.userId),
      snapshot.forkedFromId,
      {
        name: snapshot.name,
        exerciseType: snapshot.exerciseType,
        muscleGroup: snapshot.muscleGroup,
        description: snapshot.description,
      },
      snapshot.createdAt,
      new Set(snapshot.equipmentIds),
    );
  }

  toSnapshot(): ExerciseSnapshot {
    return {
      id: this.id,
      userId: this.ownership.userId,
      forkedFromId: this.forkedFrom,
      name: this.details.name,
      exerciseType: this.details.exerciseType,
      muscleGroup: this.details.muscleGroup,
      description: this.details.description,
      createdAt: this.createdAt,
      equipmentIds: [...this.equipment],
    };
  }

  get name(): string {
    return this.details.name;
  }

  get exerciseType(): ExerciseType {
    return this.details.exerciseType;
  }

  get muscleGroup(): string | null {
    return this.details.muscleGroup;
  }

  get description(): string | null {
    return this.details.description;
  }

  get forkedFromId(): string | null {
    return this.forkedFrom;
  }

  get equipmentIds(): readonly string[] {
    return [...this.equipment];
  }

  get isCardio(): boolean {
    return this.details.exerciseType === 'cardio';
  }

  /** A personal copy of a sample can be discarded to fall back on the original. */
  get canRevert(): boolean {
    return !this.ownership.isSample && this.forkedFrom !== null;
  }

  updateDetails(details: ExerciseDetails): void {
    this.details = details;
  }

  setEquipment(equipmentId: string, linked: boolean): void {
    if (linked) this.equipment.add(equipmentId);
    else this.equipment.delete(equipmentId);
  }

  /**
   * The copy a mutation should be applied to. An exercise the user already
   * owns is returned untouched; a sample is copied - carrying its details and
   * equipment links - so the shared original survives the edit.
   */
  editableCopyFor(userId: string, deps: { ids: IdGenerator; clock: Clock }): EditableCopy<Exercise> {
    if (!this.ownership.isSample) return alreadyEditable(this);

    const fork = new Exercise(
      deps.ids.next(),
      Ownership.of(userId),
      this.id,
      { ...this.details },
      deps.clock.now(),
      new Set(this.equipment),
    );

    // Equipment links are keyed by equipment id, which the fork shares with
    // the sample, so unlike routine slots there is nothing to translate.
    return {
      editable: fork,
      forkedId: fork.id,
      translateChildId: identityTranslation,
    };
  }

  /**
   * A copy of this exercise for a *different* athlete, who reached it
   * through a shared routine.
   *
   * `forkedFromId` carries over, which templates and routines deliberately
   * do not do. It is only ever non-null when it names a sample - nothing
   * else is forkable - and `exercises_user_name_unique` means the importer
   * can hold at most one row of this name, so there is no second copy to
   * make `findForkOf` ambiguous. Keeping it is what stops the imported copy
   * and the sample it descends from appearing side by side under the same
   * name, and leaves the copy revertible like any other.
   *
   * Equipment ids carry over untouched. Equipment names are globally unique
   * (see the `unique()` on `equipment.name`), so a row is the same row for
   * everyone; there is nothing to copy and nothing to remap.
   */
  copyForImport(userId: string, deps: { ids: IdGenerator; clock: Clock }): Exercise {
    return new Exercise(
      deps.ids.next(),
      Ownership.of(userId),
      this.forkedFrom,
      { ...this.details },
      deps.clock.now(),
      new Set(this.equipment),
    );
  }
}
