import type { CardioFields } from '../equipment/cardio-fields';
import type { Clock } from '../shared/clock';
import { type EditableCopy, alreadyEditable, forkedFrom } from '../shared/forking';
import type { IdGenerator } from '../shared/ids';
import { type MoveDirection, OrderedChildren } from '../shared/ordered';
import { Ownership } from '../shared/ownership';
import { SetTarget, type SetTargetSnapshot } from './set-target';

export type WorkoutExerciseSnapshot = SetTargetSnapshot & {
  readonly id: string;
  readonly exerciseId: string;
  readonly position: number;
};

export type WorkoutSnapshot = {
  readonly id: string;
  readonly userId: string | null;
  readonly forkedFromId: string | null;
  readonly name: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly exercises: readonly WorkoutExerciseSnapshot[];
};

/**
 * One exercise's place in a workout, with the targets to pre-fill.
 *
 * A child entity, not a value object: it has an id the UI addresses when
 * removing or reordering, and its position is meaningful.
 */
export class WorkoutExerciseEntry {
  constructor(
    readonly id: string,
    readonly exerciseId: string,
    public position: number,
    private currentTarget: SetTarget,
  ) {}

  get target(): SetTarget {
    return this.currentTarget;
  }

  retarget(target: SetTarget): void {
    this.currentTarget = target;
  }

  toSnapshot(): WorkoutExerciseSnapshot {
    return {
      id: this.id,
      exerciseId: this.exerciseId,
      position: this.position,
      ...this.currentTarget.toSnapshot(),
    };
  }
}

/**
 * A named, ordered list of exercises with their targets - the unit a plan
 * schedules and a session is logged against.
 *
 * Owns its own ordering and its fork-on-first-edit copy; the adapters are
 * responsible only for turning this into rows and back.
 */
export class Workout {
  private constructor(
    readonly id: string,
    readonly ownership: Ownership,
    private forkedFrom: string | null,
    private currentName: string,
    readonly createdAt: Date,
    private lastUpdatedAt: Date,
    private readonly entries: OrderedChildren<WorkoutExerciseEntry>,
  ) {}

  static create(userId: string, name: string, deps: { ids: IdGenerator; clock: Clock }): Workout {
    const now = deps.clock.now();
    return new Workout(deps.ids.next(), Ownership.of(userId), null, name, now, now, new OrderedChildren([]));
  }

  static fromSnapshot(snapshot: WorkoutSnapshot): Workout {
    return new Workout(
      snapshot.id,
      Ownership.fromUserId(snapshot.userId),
      snapshot.forkedFromId,
      snapshot.name,
      snapshot.createdAt,
      snapshot.updatedAt,
      new OrderedChildren(
        snapshot.exercises.map(
          (entry) => new WorkoutExerciseEntry(entry.id, entry.exerciseId, entry.position, SetTarget.fromSnapshot(entry)),
        ),
      ),
    );
  }

  toSnapshot(): WorkoutSnapshot {
    return {
      id: this.id,
      userId: this.ownership.userId,
      forkedFromId: this.forkedFrom,
      name: this.currentName,
      createdAt: this.createdAt,
      updatedAt: this.lastUpdatedAt,
      exercises: this.entries.map((entry) => entry.toSnapshot()),
    };
  }

  get name(): string {
    return this.currentName;
  }

  get forkedFromId(): string | null {
    return this.forkedFrom;
  }

  get updatedAt(): Date {
    return this.lastUpdatedAt;
  }

  get exercises(): readonly WorkoutExerciseEntry[] {
    return this.entries.items;
  }

  get exerciseCount(): number {
    return this.entries.size;
  }

  /** Samples are shared library data - a user removes them from view instead. */
  get isDeletable(): boolean {
    return !this.ownership.isSample;
  }

  get canRevert(): boolean {
    return !this.ownership.isSample && this.forkedFrom !== null;
  }

  rename(name: string, now: Date): void {
    this.currentName = name;
    this.touch(now);
  }

  addExercise(exerciseId: string, target: SetTarget, deps: { ids: IdGenerator; clock: Clock }): WorkoutExerciseEntry {
    const entry = new WorkoutExerciseEntry(deps.ids.next(), exerciseId, this.entries.size, target);
    this.entries.append(entry);
    this.touch(deps.clock.now());
    return entry;
  }

  /**
   * Replaces one entry's target. `cardioFields` is what the exercise's
   * equipment allows - a speed or resistance the caller submitted anyway is
   * dropped rather than stored, so a stale form can never leave a cardio
   * exercise carrying a measurement it has no equipment to report. Rest is
   * not filtered by `cardioFields`: how long to rest after a set applies to
   * strength and cardio alike.
   *
   * False when the entry isn't there - a stale form, not an error.
   */
  updateTarget(entryId: string, target: SetTarget, cardioFields: CardioFields, now: Date): boolean {
    const entry = this.entries.find(entryId);
    if (!entry) return false;

    entry.retarget(
      SetTarget.of({
        sets: target.sets,
        reps: target.reps,
        weight: target.weight,
        duration: target.duration,
        speed: cardioFields.showSpeed ? target.speed : null,
        resistance: cardioFields.showResistance ? target.resistance : null,
        rest: target.rest,
      }),
    );
    this.touch(now);
    return true;
  }

  /** False when the entry isn't there - a stale form, not an error. */
  removeExercise(entryId: string, now: Date): boolean {
    const removed = this.entries.remove(entryId);
    if (removed) this.touch(now);
    return removed;
  }

  /** False at either end of the list, or for an unknown entry. */
  moveExercise(entryId: string, direction: MoveDirection, now: Date): boolean {
    const moved = this.entries.move(entryId, direction);
    if (moved) this.touch(now);
    return moved;
  }

  /**
   * The copy a mutation should be applied to - the workout itself when the
   * user already owns it, otherwise a personal copy of the sample carrying
   * its exercises and targets. See `EditableCopy` for why the returned
   * translation matters when the caller holds an entry id.
   */
  editableCopyFor(userId: string, deps: { ids: IdGenerator; clock: Clock }): EditableCopy<Workout> {
    if (!this.ownership.isSample) return alreadyEditable(this);

    const now = deps.clock.now();
    const copiedEntries = this.entries.map(
      (entry) => new WorkoutExerciseEntry(deps.ids.next(), entry.exerciseId, entry.position, entry.target),
    );

    const fork = new Workout(
      deps.ids.next(),
      Ownership.of(userId),
      this.id,
      this.currentName,
      now,
      now,
      new OrderedChildren(copiedEntries),
    );

    return forkedFrom(fork, this.entries.items, copiedEntries);
  }

  /**
   * A copy of this workout for a *different* athlete, who reached it
   * through a shared plan.
   *
   * `forkedFromId` stays null even when this workout is itself a fork of a
   * sample. It means "my personal copy of a sample", and a shared plan
   * can be imported twice - two rows forked from one sample would leave
   * `findForkOf` with two answers and hide the sample behind both. The copy
   * is a plain workout of the importer's own. (An imported *exercise* does
   * carry it, because a per-athlete unique name makes a second copy
   * impossible - see `Exercise.copyForImport`.)
   *
   * `exerciseIdFor` maps each entry's exercise onto whatever stands in for
   * it in the importer's library; the caller resolves that, because it needs
   * queries.
   */
  copyForImport(
    userId: string,
    exerciseIdFor: (exerciseId: string) => string,
    deps: { ids: IdGenerator; clock: Clock },
  ): Workout {
    const now = deps.clock.now();
    const copiedEntries = this.entries.map(
      (entry) => new WorkoutExerciseEntry(deps.ids.next(), exerciseIdFor(entry.exerciseId), entry.position, entry.target),
    );

    return new Workout(
      deps.ids.next(),
      Ownership.of(userId),
      null,
      this.currentName,
      now,
      now,
      new OrderedChildren(copiedEntries),
    );
  }

  private touch(now: Date): void {
    this.lastUpdatedAt = now;
  }
}
