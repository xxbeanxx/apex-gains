import { formatNumber } from './units';

/**
 * Rate of perceived exertion, on the Borg CR10 scale athletes actually use in
 * the gym: 1 (barely anything) to 10 (absolute failure), in half-point steps.
 *
 * Unlike `Weight` and `Speed` there is no unit to convert between - the same
 * number means the same effort for every athlete - so this only has to guard
 * the scale itself.
 */
export class Rpe {
  private constructor(private readonly rating: number) {}

  static of(value: number): Rpe {
    if (!Rpe.isValid(value)) throw new Error(`Invalid RPE: ${value}`);
    return new Rpe(value);
  }

  /** 1 to 10, in half-point steps - use to validate a value off a request before it reaches `of`. */
  static isValid(value: number): boolean {
    return Number.isFinite(value) && value >= 1 && value <= 10 && Math.round(value * 2) === value * 2;
  }

  /** Parses a `numeric` column. Null, empty and unparseable all read as absent. */
  static fromStorage(value: string | null | undefined): Rpe | null {
    if (value == null || value === '') return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? new Rpe(parsed) : null;
  }

  get value(): number {
    return this.rating;
  }

  /** `numeric(3, 1)`. */
  toStorage(): string {
    return this.rating.toFixed(1);
  }

  /** "RPE 8" - what a set's summary line appends. */
  format(): string {
    return `RPE ${formatNumber(this.rating)}`;
  }
}
