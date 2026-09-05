import type { Duration } from '../values/duration';
import type { Speed } from '../values/speed';
import { DEFAULT_TIMEZONE } from '../values/timezone';
import type { DistanceUnit, WeightUnit } from '../values/units';
import type { Weight } from '../values/weight';

/**
 * How an athlete wants their numbers shown, whether they want the shared
 * sample library in their lists at all, and which calendar day their
 * training day falls on.
 *
 * The formatting lives on the preferences rather than beside them, which is
 * what makes the /settings choice actually take effect: a service rendering
 * a measurement has to come through here, so there is no plausible way to
 * hardcode a unit by accident. `timezone` is an IANA zone name (see
 * `../values/timezone.ts`) and is what every per-athlete `DateOnly.today()`
 * call should be passed - it decides when "today" rolls over for this
 * athlete, independent of where the server itself runs.
 */
export class AthletePreferences {
  constructor(
    readonly weightUnit: WeightUnit,
    readonly distanceUnit: DistanceUnit,
    readonly showSampleData: boolean,
    readonly timezone: string,
  ) {}

  static defaults(): AthletePreferences {
    return new AthletePreferences('lb', 'km', true, DEFAULT_TIMEZONE);
  }

  withUnits(weightUnit: WeightUnit, distanceUnit: DistanceUnit): AthletePreferences {
    return new AthletePreferences(weightUnit, distanceUnit, this.showSampleData, this.timezone);
  }

  withSampleData(showSampleData: boolean): AthletePreferences {
    return new AthletePreferences(this.weightUnit, this.distanceUnit, showSampleData, this.timezone);
  }

  withTimezone(timezone: string): AthletePreferences {
    return new AthletePreferences(this.weightUnit, this.distanceUnit, this.showSampleData, timezone);
  }

  formatWeight(weight: Weight | null): string | null {
    return weight ? weight.format(this.weightUnit) : null;
  }

  formatSpeed(speed: Speed | null): string | null {
    return speed ? speed.format(this.distanceUnit) : null;
  }

  /** Duration carries no unit preference; here so every measurement formats one way. */
  formatDuration(duration: Duration | null): string | null {
    return duration ? duration.format() : null;
  }

  /** The bare number for a chart axis, without the unit suffix. */
  weightValue(weight: Weight): number {
    return weight.as(this.weightUnit);
  }

  /** The bare number for an editable field, without the unit suffix. */
  speedValue(speed: Speed): number {
    return speed.as(this.distanceUnit);
  }
}
