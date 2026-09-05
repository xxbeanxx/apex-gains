import { type DistanceUnit, formatNumber, speedUnitLabel } from './units';

const MI_PER_KM = 0.621371;

/**
 * A treadmill or rowing speed, held canonically in km/h.
 *
 * Same story as `Weight`: `session_sets.speed` and
 * `template_exercises.target_speed` are unitless `numeric` columns. Storing
 * canonically and converting at the edge is what carries the athlete's
 * distance preference through to the treadmill readout.
 */
export class Speed {
  private constructor(private readonly kmPerHour: number) {}

  static kmh(value: number): Speed {
    return new Speed(value);
  }

  static mph(value: number): Speed {
    return new Speed(value / MI_PER_KM);
  }

  static in(unit: DistanceUnit, value: number): Speed {
    return unit === 'km' ? Speed.kmh(value) : Speed.mph(value);
  }

  static fromStorage(value: string | null | undefined): Speed | null {
    if (value == null || value === '') return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? new Speed(parsed) : null;
  }

  get inKmPerHour(): number {
    return this.kmPerHour;
  }

  get inMilesPerHour(): number {
    return this.kmPerHour * MI_PER_KM;
  }

  as(unit: DistanceUnit): number {
    return unit === 'km' ? this.inKmPerHour : this.inMilesPerHour;
  }

  /** `numeric(5, 2)`. */
  toStorage(): string {
    return this.kmPerHour.toFixed(2);
  }

  /** "8.5 km/h", "5.3 mph". */
  format(unit: DistanceUnit): string {
    return `${formatNumber(this.as(unit))} ${speedUnitLabel(unit)}`;
  }
}
