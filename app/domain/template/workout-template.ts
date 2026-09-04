import type { Clock } from "../shared/clock";
import {
  alreadyEditable,
  type EditableCopy,
  forkedFrom,
} from "../shared/forking";
import type { IdGenerator } from "../shared/ids";
import { type MoveDirection, OrderedChildren } from "../shared/ordered";
import { Ownership } from "../shared/ownership";
import { SetTarget, type SetTargetSnapshot } from "./set-target";

export type TemplateExerciseSnapshot = SetTargetSnapshot & {
  readonly id: string;
  readonly exerciseId: string;
  readonly position: number;
};

export type TemplateSnapshot = {
  readonly id: string;
  readonly userId: string | null;
  readonly forkedFromId: string | null;
  readonly name: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly exercises: readonly TemplateExerciseSnapshot[];
};

/**
 * One exercise's place in a template, with the targets to pre-fill.
 *
 * A child entity, not a value object: it has an id the UI addresses when
 * removing or reordering, and its position is meaningful.
 */
export class TemplateExerciseEntry {
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

  toSnapshot(): TemplateExerciseSnapshot {
    return {
      id: this.id,
      exerciseId: this.exerciseId,
      position: this.position,
      ...this.currentTarget.toSnapshot(),
    };
  }
}

/**
 * A named, ordered list of exercises with their targets - the unit a routine
 * schedules and a session is logged against.
 *
 * Owns its own ordering and its fork-on-first-edit copy; the adapters are
 * responsible only for turning this into rows and back.
 */
export class WorkoutTemplate {
  private constructor(
    readonly id: string,
    readonly ownership: Ownership,
    private forkedFrom: string | null,
    private currentName: string,
    readonly createdAt: Date,
    private lastUpdatedAt: Date,
    private readonly entries: OrderedChildren<TemplateExerciseEntry>,
  ) {}

  static create(
    userId: string,
    name: string,
    deps: { ids: IdGenerator; clock: Clock },
  ): WorkoutTemplate {
    const now = deps.clock.now();
    return new WorkoutTemplate(
      deps.ids.next(),
      Ownership.of(userId),
      null,
      name,
      now,
      now,
      new OrderedChildren([]),
    );
  }

  static fromSnapshot(snapshot: TemplateSnapshot): WorkoutTemplate {
    return new WorkoutTemplate(
      snapshot.id,
      Ownership.fromUserId(snapshot.userId),
      snapshot.forkedFromId,
      snapshot.name,
      snapshot.createdAt,
      snapshot.updatedAt,
      new OrderedChildren(
        snapshot.exercises.map(
          (entry) =>
            new TemplateExerciseEntry(
              entry.id,
              entry.exerciseId,
              entry.position,
              SetTarget.fromSnapshot(entry),
            ),
        ),
      ),
    );
  }

  toSnapshot(): TemplateSnapshot {
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

  get exercises(): readonly TemplateExerciseEntry[] {
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

  addExercise(
    exerciseId: string,
    target: SetTarget,
    deps: { ids: IdGenerator; clock: Clock },
  ): TemplateExerciseEntry {
    const entry = new TemplateExerciseEntry(
      deps.ids.next(),
      exerciseId,
      this.entries.size,
      target,
    );
    this.entries.append(entry);
    this.touch(deps.clock.now());
    return entry;
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
   * The copy a mutation should be applied to - the template itself when the
   * user already owns it, otherwise a personal copy of the sample carrying
   * its exercises and targets. See `EditableCopy` for why the returned
   * translation matters when the caller holds an entry id.
   */
  editableCopyFor(
    userId: string,
    deps: { ids: IdGenerator; clock: Clock },
  ): EditableCopy<WorkoutTemplate> {
    if (!this.ownership.isSample) return alreadyEditable(this);

    const now = deps.clock.now();
    const copiedEntries = this.entries.map(
      (entry) =>
        new TemplateExerciseEntry(
          deps.ids.next(),
          entry.exerciseId,
          entry.position,
          entry.target,
        ),
    );

    const fork = new WorkoutTemplate(
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

  private touch(now: Date): void {
    this.lastUpdatedAt = now;
  }
}
