import type { Clock } from "../shared/clock";
import type { IdGenerator } from "../shared/ids";
import { Ownership } from "../shared/ownership";

export type EquipmentSnapshot = {
  readonly id: string;
  readonly userId: string | null;
  readonly name: string;
  readonly createdAt: Date;
};

/**
 * A machine or implement an exercise can be performed on.
 *
 * Unlike exercises, templates and routines, equipment has no fork-on-write
 * rule: names are globally unique (see the `unique()` on `equipment.name`),
 * so a sample is shared as-is rather than copied per user.
 */
export class Equipment {
  private constructor(
    readonly id: string,
    readonly ownership: Ownership,
    private currentName: string,
    readonly createdAt: Date,
  ) {}

  static create(
    userId: string,
    name: string,
    deps: { ids: IdGenerator; clock: Clock },
  ): Equipment {
    return new Equipment(
      deps.ids.next(),
      Ownership.of(userId),
      name,
      deps.clock.now(),
    );
  }

  static fromSnapshot(snapshot: EquipmentSnapshot): Equipment {
    return new Equipment(
      snapshot.id,
      Ownership.fromUserId(snapshot.userId),
      snapshot.name,
      snapshot.createdAt,
    );
  }

  toSnapshot(): EquipmentSnapshot {
    return {
      id: this.id,
      userId: this.ownership.userId,
      name: this.currentName,
      createdAt: this.createdAt,
    };
  }

  get name(): string {
    return this.currentName;
  }

  rename(name: string): void {
    this.currentName = name;
  }

  /** Sample equipment is shared library data, so only a user's own is removable. */
  isRemovableBy(userId: string): boolean {
    return this.ownership.isOwnedBy(userId);
  }
}
