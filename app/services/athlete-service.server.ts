import type { Athlete } from "~/domain/athlete/athlete";
import type { DistanceUnit, WeightUnit } from "~/domain/values/units";
import type { AthletesRepository } from "~/repositories/athletes-repository.server";
import { getAthletesRepository } from "~/repositories/athletes-repository.server";

import { productionDeps, type DomainDeps } from "./shared/deps.server";

/**
 * Use cases for an athlete's own settings.
 *
 * Both of these reach further than they look: the unit preferences decide
 * how every weight and speed in the app is rendered, and the sample-data
 * flag decides what the exercise, template and routine lists contain.
 */
export class AthleteService {
  constructor(
    private readonly athletes: AthletesRepository,
    private readonly deps: DomainDeps = productionDeps,
  ) {}

  async changeUnits(
    athlete: Athlete,
    weightUnit: WeightUnit,
    distanceUnit: DistanceUnit,
  ): Promise<void> {
    athlete.changeUnits(weightUnit, distanceUnit, this.deps.clock.now());
    await this.athletes.save(athlete);
  }

  async changeSampleDataVisibility(
    athlete: Athlete,
    showSampleData: boolean,
  ): Promise<void> {
    athlete.changeSampleDataVisibility(
      showSampleData,
      this.deps.clock.now(),
    );
    await this.athletes.save(athlete);
  }
}

let service: AthleteService | undefined;

export async function getAthleteService(): Promise<AthleteService> {
  if (!service) {
    service = new AthleteService(await getAthletesRepository());
  }
  return service;
}
