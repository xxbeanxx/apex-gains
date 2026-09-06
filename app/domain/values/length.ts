import { formatNumber, type LengthUnit } from './units';

const CM_PER_IN = 2.54;

/**
 * A body measurement (waist, chest, an arm, ...), held canonically in
 * centimetres.
 *
 * Mirrors `Weight`'s shape exactly: the `numeric` column that stores one
 * (`body_measurements.value`) carries no unit, and postgres-js hands it back
 * as a string. Parsed once on the way in, converted to the athlete's chosen
 * length unit once on the way out.
 */
export class Length {
  private constructor(private readonly centimetres: number) {}

  static cm(value: number): Length {
    return new Length(value);
  }

  static in(value: number): Length {
    return new Length(value * CM_PER_IN);
  }

  /** Reads a number the athlete typed, in whichever unit they have selected. */
  static of(unit: LengthUnit, value: number): Length {
    return unit === 'cm' ? Length.cm(value) : Length.in(value);
  }

  /** Parses a `numeric` column. Null, empty and unparseable all read as absent. */
  static fromStorage(value: string | null | undefined): Length | null {
    if (value == null || value === '') return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? new Length(parsed) : null;
  }

  get inCentimetres(): number {
    return this.centimetres;
  }

  get inInches(): number {
    return this.centimetres / CM_PER_IN;
  }

  as(unit: LengthUnit): number {
    return unit === 'cm' ? this.inCentimetres : this.inInches;
  }

  /** `numeric(5, 2)` - two decimal places is the column's full precision. */
  toStorage(): string {
    return this.centimetres.toFixed(2);
  }

  /** "86 cm", "34 in" - what the UI shows. */
  format(unit: LengthUnit): string {
    return `${formatNumber(this.as(unit))} ${unit}`;
  }
}
