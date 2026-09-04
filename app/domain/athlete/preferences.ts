import type { Duration } from "../values/duration";
import type { Speed } from "../values/speed";
import type { DistanceUnit, WeightUnit } from "../values/units";
import type { Weight } from "../values/weight";

/**
 * How an athlete wants their numbers shown, and whether they want the shared
 * sample library in their lists at all.
 *
 * The formatting lives on the preferences rather than beside them, which is
 * what makes the /settings choice actually take effect: a service rendering
 * a measurement has to come through here, so there is no plausible way to
 * hardcode a unit by accident.
 */
export class AthletePreferences {
  constructor(
    readonly weightUnit: WeightUnit,
    readonly distanceUnit: DistanceUnit,
    readonly showSampleData: boolean,
  ) {}

  static defaults(): AthletePreferences {
    return new AthletePreferences("lb", "km", true);
  }

  withUnits(
    weightUnit: WeightUnit,
    distanceUnit: DistanceUnit,
  ): AthletePreferences {
    return new AthletePreferences(
      weightUnit,
      distanceUnit,
      this.showSampleData,
    );
  }

  withSampleData(showSampleData: boolean): AthletePreferences {
    return new AthletePreferences(
      this.weightUnit,
      this.distanceUnit,
      showSampleData,
    );
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
}
