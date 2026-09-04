import type { Clock } from "../shared/clock";
import {
  alreadyEditable,
  type EditableCopy,
  forkedFrom,
} from "../shared/forking";
import type { IdGenerator } from "../shared/ids";
import { type MoveDirection, OrderedChildren } from "../shared/ordered";
import { Ownership } from "../shared/ownership";
import { DateOnly } from "../values/date-only";

export type RoutineSlotSnapshot = {
  readonly id: string;
  readonly position: number;
  readonly templateId: string | null;
};

export type RoutineSnapshot = {
  readonly id: string;
  readonly userId: string | null;
  readonly forkedFromId: string | null;
  readonly name: string;
  readonly isActive: boolean;
  readonly anchorDate: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly slots: readonly RoutineSlotSnapshot[];
};

/**
 * One day of a routine's cycle: either a template to train, or a rest day.
 *
 * A null `templateId` *is* the rest day - there is no separate flag, and
 * a slot whose template was since deleted (the FK is `on delete set null`)
 * degrades into one, which is the intended behaviour rather than an error.
 */
export class RoutineSlot {
  constructor(
    readonly id: string,
    public position: number,
    private template: string | null,
  ) {}

  get templateId(): string | null {
    return this.template;
  }

  get isRestDay(): boolean {
    return this.template === null;
  }

  toSnapshot(): RoutineSlotSnapshot {
    return {
      id: this.id,
      position: this.position,
      templateId: this.template,
    };
  }
}

/**
 * A repeating cycle of training days.
 *
 * The defining rule, and the reason this is worth modelling: a routine
 * cycles on *day count from an anchor date*, not on weekdays. Which slot
 * falls on a given day is `(days since anchorDate) mod (slot count)` - it
 * never pauses for a missed day, and a 7-slot routine only lines up with
 * weekdays if the anchor happens to fall right. `slotOn` is that rule.
 */
export class Routine {
  private constructor(
    readonly id: string,
    readonly ownership: Ownership,
    private forkedFrom: string | null,
    private currentName: string,
    private active: boolean,
    private anchor: DateOnly,
    readonly createdAt: Date,
    private lastUpdatedAt: Date,
    private readonly slotList: OrderedChildren<RoutineSlot>,
  ) {}

  static create(
    userId: string,
    name: string,
    anchorDate: DateOnly,
    deps: { ids: IdGenerator; clock: Clock },
  ): Routine {
    const now = deps.clock.now();
    return new Routine(
      deps.ids.next(),
      Ownership.of(userId),
      null,
      name,
      false,
      anchorDate,
      now,
      now,
      new OrderedChildren([]),
    );
  }

  static fromSnapshot(snapshot: RoutineSnapshot): Routine {
    return new Routine(
      snapshot.id,
      Ownership.fromUserId(snapshot.userId),
      snapshot.forkedFromId,
      snapshot.name,
      snapshot.isActive,
      DateOnly.parse(snapshot.anchorDate),
      snapshot.createdAt,
      snapshot.updatedAt,
      new OrderedChildren(
        snapshot.slots.map(
          (slot) => new RoutineSlot(slot.id, slot.position, slot.templateId),
        ),
      ),
    );
  }

  toSnapshot(): RoutineSnapshot {
    return {
      id: this.id,
      userId: this.ownership.userId,
      forkedFromId: this.forkedFrom,
      name: this.currentName,
      isActive: this.active,
      anchorDate: this.anchor.value,
      createdAt: this.createdAt,
      updatedAt: this.lastUpdatedAt,
      slots: this.slotList.map((slot) => slot.toSnapshot()),
    };
  }

  get name(): string {
    return this.currentName;
  }

  get isActive(): boolean {
    return this.active;
  }

  get anchorDate(): DateOnly {
    return this.anchor;
  }

  get forkedFromId(): string | null {
    return this.forkedFrom;
  }

  get updatedAt(): Date {
    return this.lastUpdatedAt;
  }

  get slots(): readonly RoutineSlot[] {
    return this.slotList.items;
  }

  get cycleLength(): number {
    return this.slotList.size;
  }

  get isDeletable(): boolean {
    return !this.ownership.isSample;
  }

  get canRevert(): boolean {
    return !this.ownership.isSample && this.forkedFrom !== null;
  }

  /**
   * Which slot of the cycle `date` falls on, or null for a routine with no
   * slots yet (which schedules nothing rather than dividing by zero).
   *
   * The double modulo keeps dates *before* the anchor on the cycle too, so a
   * routine anchored in the future still answers for today.
   */
  slotIndexOn(date: DateOnly): number | null {
    if (this.slotList.isEmpty) return null;
    const offset = this.anchor.daysUntil(date);
    const length = this.cycleLength;
    return ((offset % length) + length) % length;
  }

  slotOn(date: DateOnly): RoutineSlot | null {
    const index = this.slotIndexOn(date);
    return index === null ? null : (this.slotList.at(index) ?? null);
  }

  rename(name: string, now: Date): void {
    this.currentName = name;
    this.touch(now);
  }

  /**
   * Moves the cycle's origin. Deliberately independent of when the routine
   * was activated and of what weekday it lands on - re-anchoring is how an
   * athlete resyncs a drifted cycle without rebuilding it.
   */
  reanchor(anchorDate: DateOnly, now: Date): void {
    this.anchor = anchorDate;
    this.touch(now);
  }

  /**
   * Only one routine per user may be active, which is a rule about a *set*
   * of routines rather than about any one of them - so this is intentionally
   * not the whole story. Go through `activateRoutine` in ./activation, which
   * coordinates both sides; the partial unique index in the schema is the
   * backstop.
   */
  activate(now: Date): void {
    this.active = true;
    this.touch(now);
  }

  deactivate(now: Date): void {
    this.active = false;
    this.touch(now);
  }

  /** A null `templateId` adds a rest day. */
  addSlot(
    templateId: string | null,
    deps: { ids: IdGenerator; clock: Clock },
  ): RoutineSlot {
    const slot = new RoutineSlot(
      deps.ids.next(),
      this.slotList.size,
      templateId,
    );
    this.slotList.append(slot);
    this.touch(deps.clock.now());
    return slot;
  }

  removeSlot(slotId: string, now: Date): boolean {
    const removed = this.slotList.remove(slotId);
    if (removed) this.touch(now);
    return removed;
  }

  moveSlot(slotId: string, direction: MoveDirection, now: Date): boolean {
    const moved = this.slotList.move(slotId, direction);
    if (moved) this.touch(now);
    return moved;
  }

  /**
   * The copy a mutation should be applied to. A fork is never active even if
   * the sample it came from was: activation is per-athlete state, and
   * claiming it here would sidestep the coordination in ./activation.
   */
  editableCopyFor(
    userId: string,
    deps: { ids: IdGenerator; clock: Clock },
  ): EditableCopy<Routine> {
    if (!this.ownership.isSample) return alreadyEditable(this);

    const now = deps.clock.now();
    const copiedSlots = this.slotList.map(
      (slot) => new RoutineSlot(deps.ids.next(), slot.position, slot.templateId),
    );

    const fork = new Routine(
      deps.ids.next(),
      Ownership.of(userId),
      this.id,
      this.currentName,
      false,
      this.anchor,
      now,
      now,
      new OrderedChildren(copiedSlots),
    );

    return forkedFrom(fork, this.slotList.items, copiedSlots);
  }

  private touch(now: Date): void {
    this.lastUpdatedAt = now;
  }
}
