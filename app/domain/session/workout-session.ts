import type { Clock } from '../shared/clock';
import type { IdGenerator } from '../shared/ids';
import { DateOnly } from '../values/date-only';
import { Weight } from '../values/weight';
import { LoggedSet, type LoggedSetSnapshot, type SetMeasurements } from './logged-set';

export type WorkoutSessionSnapshot = {
  readonly id: string;
  readonly userId: string;
  readonly date: string;
  readonly routineId: string | null;
  readonly templateId: string | null;
  readonly isRestDay: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly sets: readonly LoggedSetSnapshot[];
};

/**
 * What the routine said this day was, captured when the session opened.
 *
 * Snapshotting it means history stays truthful after the fact: editing or
 * deleting a routine later doesn't rewrite what a past day claimed to be.
 * The FKs are `on delete set null` for the same reason.
 */
export type SessionPlan = {
  readonly routineId: string | null;
  readonly templateId: string | null;
  readonly isRestDay: boolean;
};

/**
 * One athlete's training on one calendar day, and every set logged in it.
 *
 * There is exactly one session per (athlete, day) - the unique constraint
 * enforces it - so a session is opened idempotently and then accumulates
 * sets. Set numbering is per exercise within the day, which is what makes
 * "set 3 of the bench press" mean something across a pyramid.
 */
export class WorkoutSession {
  private constructor(
    readonly id: string,
    readonly userId: string,
    readonly date: DateOnly,
    readonly plan: SessionPlan,
    readonly createdAt: Date,
    private lastUpdatedAt: Date,
    private readonly loggedSets: LoggedSet[],
  ) {}

  static open(userId: string, date: DateOnly, plan: SessionPlan, deps: { ids: IdGenerator; clock: Clock }): WorkoutSession {
    const now = deps.clock.now();
    return new WorkoutSession(deps.ids.next(), userId, date, plan, now, now, []);
  }

  static fromSnapshot(snapshot: WorkoutSessionSnapshot): WorkoutSession {
    return new WorkoutSession(
      snapshot.id,
      snapshot.userId,
      DateOnly.parse(snapshot.date),
      {
        routineId: snapshot.routineId,
        templateId: snapshot.templateId,
        isRestDay: snapshot.isRestDay,
      },
      snapshot.createdAt,
      snapshot.updatedAt,
      snapshot.sets.map((set) => LoggedSet.fromSnapshot(set)).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()),
    );
  }

  toSnapshot(): WorkoutSessionSnapshot {
    return {
      id: this.id,
      userId: this.userId,
      date: this.date.value,
      routineId: this.plan.routineId,
      templateId: this.plan.templateId,
      isRestDay: this.plan.isRestDay,
      createdAt: this.createdAt,
      updatedAt: this.lastUpdatedAt,
      sets: this.loggedSets.map((set) => set.toSnapshot()),
    };
  }

  /** In the order they were performed. */
  get sets(): readonly LoggedSet[] {
    return this.loggedSets;
  }

  get updatedAt(): Date {
    return this.lastUpdatedAt;
  }

  get setCount(): number {
    return this.loggedSets.length;
  }

  get exerciseCount(): number {
    return new Set(this.loggedSets.map((set) => set.exerciseId)).size;
  }

  get isRestDay(): boolean {
    return this.plan.isRestDay;
  }

  /**
   * How a day reads on the history timeline. A day with sets logged is a
   * workout whatever the routine had planned - training through a scheduled
   * rest day still counts as having trained.
   */
  get status(): 'workout' | 'rest' | 'none' {
    if (this.loggedSets.length > 0) return 'workout';
    return this.plan.isRestDay ? 'rest' : 'none';
  }

  setsFor(exerciseId: string): readonly LoggedSet[] {
    return this.loggedSets.filter((set) => set.exerciseId === exerciseId);
  }

  /** Total weight moved: the sum over sets that recorded both a weight and reps. */
  get tonnage(): Weight {
    return this.loggedSets.reduce((total, set) => (set.tonnage ? total.plus(set.tonnage) : total), Weight.lb(0));
  }

  logSet(exerciseId: string, measurements: SetMeasurements, deps: { ids: IdGenerator; clock: Clock }): LoggedSet {
    const now = deps.clock.now();
    const set = new LoggedSet(
      deps.ids.next(),
      exerciseId,
      this.setsFor(exerciseId).length + 1,
      measurements.reps ?? null,
      measurements.weight ?? null,
      measurements.duration ?? null,
      measurements.speed ?? null,
      measurements.resistance ?? null,
      now,
    );
    this.loggedSets.push(set);
    this.lastUpdatedAt = now;
    return set;
  }

  /**
   * Removes a set. Later sets of the same exercise keep their numbers rather
   * than shuffling down - deleting set 2 of 3 leaves sets 1 and 3, because
   * renumbering would silently rewrite what the athlete did.
   */
  removeSet(setId: string, now: Date): boolean {
    const index = this.loggedSets.findIndex((set) => set.id === setId);
    if (index === -1) return false;
    this.loggedSets.splice(index, 1);
    this.lastUpdatedAt = now;
    return true;
  }

  isOwnedBy(userId: string): boolean {
    return this.userId === userId;
  }
}
