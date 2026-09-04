import type { Clock } from '../shared/clock';
import type { IdGenerator } from '../shared/ids';
import type { DistanceUnit, WeightUnit } from '../values/units';
import { AthletePreferences } from './preferences';

export type AthleteSnapshot = {
  readonly id: string;
  readonly googleSub: string;
  readonly email: string;
  readonly name: string;
  readonly avatarUrl: string | null;
  readonly weightUnit: WeightUnit;
  readonly distanceUnit: DistanceUnit;
  readonly showSampleData: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};

export type NewAthlete = {
  readonly googleSub: string;
  readonly email: string;
  readonly name: string;
  readonly avatarUrl: string | null;
};

/**
 * The person training - the `users` row, named for what it means here.
 *
 * There is no role or permission model (signup is open to any Google
 * account); an athlete's authority is simply that they own their own rows,
 * which `Ownership` expresses. So this aggregate is mostly a home for the
 * preferences that shape how everything else is rendered.
 */
export class Athlete {
  private constructor(
    readonly id: string,
    readonly googleSub: string,
    readonly email: string,
    readonly name: string,
    readonly avatarUrl: string | null,
    private currentPreferences: AthletePreferences,
    readonly createdAt: Date,
    private lastUpdatedAt: Date,
  ) {}

  /**
   * A brand new athlete, on their first sign-in.
   *
   * Starting preferences come from `AthletePreferences.defaults()` and are
   * written explicitly, so this is the one place that answers "what does a
   * new account look like". The `users` table carries matching column
   * defaults as a backstop for rows inserted outside the app, but nothing
   * here depends on them.
   */
  static register(details: NewAthlete, deps: { ids: IdGenerator; clock: Clock }): Athlete {
    const now = deps.clock.now();
    return new Athlete(
      deps.ids.next(),
      details.googleSub,
      details.email,
      details.name,
      details.avatarUrl,
      AthletePreferences.defaults(),
      now,
      now,
    );
  }

  static fromSnapshot(snapshot: AthleteSnapshot): Athlete {
    return new Athlete(
      snapshot.id,
      snapshot.googleSub,
      snapshot.email,
      snapshot.name,
      snapshot.avatarUrl,
      new AthletePreferences(snapshot.weightUnit, snapshot.distanceUnit, snapshot.showSampleData),
      snapshot.createdAt,
      snapshot.updatedAt,
    );
  }

  toSnapshot(): AthleteSnapshot {
    return {
      id: this.id,
      googleSub: this.googleSub,
      email: this.email,
      name: this.name,
      avatarUrl: this.avatarUrl,
      weightUnit: this.currentPreferences.weightUnit,
      distanceUnit: this.currentPreferences.distanceUnit,
      showSampleData: this.currentPreferences.showSampleData,
      createdAt: this.createdAt,
      updatedAt: this.lastUpdatedAt,
    };
  }

  get preferences(): AthletePreferences {
    return this.currentPreferences;
  }

  get updatedAt(): Date {
    return this.lastUpdatedAt;
  }

  changeUnits(weightUnit: WeightUnit, distanceUnit: DistanceUnit, now: Date): void {
    this.currentPreferences = this.currentPreferences.withUnits(weightUnit, distanceUnit);
    this.lastUpdatedAt = now;
  }

  changeSampleDataVisibility(showSampleData: boolean, now: Date): void {
    this.currentPreferences = this.currentPreferences.withSampleData(showSampleData);
    this.lastUpdatedAt = now;
  }
}
