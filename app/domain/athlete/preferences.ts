import type { Duration } from "../values/duration";
import type { Speed } from "../values/speed";
import type { DistanceUnit, WeightUnit } from "../values/units";
import type { Weight } from "../values/weight";

/**
 * How an athlete wants their numbers shown, and whether they want the shared
 * sample library in their lists at all.
 *
 * These columns have existed since the schema was written and were editable
 * in /settings, but nothing except the weight chart's axis label ever read
 * them - every other call site appended a hardcoded "lb". Giving the
 * preferences a home with the formatting on it is what makes the setting
 * take effect: a service that needs to render a measurement has to go
 * through here, and there is no longer a plausible way to hardcode a unit
 * by accident.
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
