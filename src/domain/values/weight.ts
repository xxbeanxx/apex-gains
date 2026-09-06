import { type WeightUnit, formatNumber } from '~domain/values/units';

const KG_PER_LB = 0.45359237;

/**
 * A weight, held canonically in pounds.
 *
 * The `numeric` columns that store weights (`session_sets.weight`,
 * `workout_exercises.target_weight`, `body_weight_logs.weight`) carry no
 * unit, and postgres-js hands them back as strings. Everything crossing that
 * boundary goes through here: parsed once on the way in, converted to the
 * athlete's chosen unit once on the way out.
 *
 * Pounds are canonical because that is how the existing rows were written -
 * see the note in README.md about interpreting pre-existing data.
 */
export class Weight {
  private constructor(private readonly pounds: number) {}

  static lb(value: number): Weight {
    return new Weight(value);
  }

  static kg(value: number): Weight {
    return new Weight(value / KG_PER_LB);
  }

  /** Reads a number the athlete typed, in whichever unit they have selected. */
  static in(unit: WeightUnit, value: number): Weight {
    return unit === 'lb' ? Weight.lb(value) : Weight.kg(value);
  }

  /** Parses a `numeric` column. Null, empty and unparseable all read as absent. */
  static fromStorage(value: string | null | undefined): Weight | null {
    if (value == null || value === '') return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? new Weight(parsed) : null;
  }

  get inPounds(): number {
    return this.pounds;
  }

  get inKilograms(): number {
    return this.pounds * KG_PER_LB;
  }

  as(unit: WeightUnit): number {
    return unit === 'lb' ? this.inPounds : this.inKilograms;
  }

  /** `numeric(6, 2)` - two decimal places is the column's full precision. */
  toStorage(): string {
    return this.pounds.toFixed(2);
  }

  /** "135 lb", "61.2 kg" - what the UI shows. */
  format(unit: WeightUnit): string {
    return `${formatNumber(this.as(unit))} ${unit}`;
  }

  times(factor: number): Weight {
    return new Weight(this.pounds * factor);
  }

  plus(other: Weight): Weight {
    return new Weight(this.pounds + other.pounds);
  }
}
