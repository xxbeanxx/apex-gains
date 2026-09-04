import type { Clock } from '../shared/clock';
import type { IdGenerator } from '../shared/ids';
import { Ownership } from '../shared/ownership';

/**
 * Which cardio measurement a piece of equipment reports. `null` means no
 * restriction - either the equipment isn't cardio-specific (free weights),
 * or it reports both (a multi-purpose machine like the BowFlex). Cardio
 * logging and template-target forms use this to decide which of the two
 * fields to show; see `cardioFieldsFor` in `app/lib/cardio-equipment.ts`.
 */
export const CARDIO_KINDS = ['speed', 'resistance'] as const;
export type CardioKind = (typeof CARDIO_KINDS)[number];

export type EquipmentSnapshot = {
  readonly id: string;
  readonly userId: string | null;
  readonly name: string;
  readonly cardioKind: CardioKind | null;
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
    private currentCardioKind: CardioKind | null,
    readonly createdAt: Date,
  ) {}

  static create(
    userId: string,
    name: string,
    cardioKind: CardioKind | null,
    deps: { ids: IdGenerator; clock: Clock },
  ): Equipment {
    return new Equipment(deps.ids.next(), Ownership.of(userId), name, cardioKind, deps.clock.now());
  }

  static fromSnapshot(snapshot: EquipmentSnapshot): Equipment {
    return new Equipment(
      snapshot.id,
      Ownership.fromUserId(snapshot.userId),
      snapshot.name,
      snapshot.cardioKind,
      snapshot.createdAt,
    );
  }

  toSnapshot(): EquipmentSnapshot {
    return {
      id: this.id,
      userId: this.ownership.userId,
      name: this.currentName,
      cardioKind: this.currentCardioKind,
      createdAt: this.createdAt,
    };
  }

  get name(): string {
    return this.currentName;
  }

  get cardioKind(): CardioKind | null {
    return this.currentCardioKind;
  }

  rename(name: string): void {
    this.currentName = name;
  }

  setCardioKind(cardioKind: CardioKind | null): void {
    this.currentCardioKind = cardioKind;
  }

  /** Sample equipment is shared library data, so only a user's own is removable. */
  isRemovableBy(userId: string): boolean {
    return this.ownership.isOwnedBy(userId);
  }
}
