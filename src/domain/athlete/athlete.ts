import { AthletePreferences } from '~domain/athlete/preferences';
import type { Clock } from '~domain/shared/clock';
import type { IdGenerator } from '~domain/shared/ids';
import { Duration } from '~domain/values/duration';
import type { DistanceUnit, LengthUnit, WeightUnit } from '~domain/values/units';

export type AthleteSnapshot = {
  readonly id: string;
  readonly googleSub: string;
  readonly email: string;
  readonly name: string;
  readonly avatarUrl: string | null;
  readonly weightUnit: WeightUnit;
  readonly distanceUnit: DistanceUnit;
  readonly lengthUnit: LengthUnit;
  readonly showSampleData: boolean;
  readonly timezone: string;
  readonly defaultRestSeconds: number | null;
  readonly isAdmin: boolean;
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
 * Signup is open to any Google account, and over their own data an athlete's
 * authority is simply that they own their own rows, which `Ownership`
 * expresses. The one thing that reaches past that boundary is `isAdmin`: an
 * administrator may see and act on *every* athlete's account through
 * `/admin`. It is a single flag rather than a role table because the app has
 * exactly two kinds of person, and the rules that span several athletes -
 * who may hold the flag, and who may take it away - live in
 * `./administration.ts` rather than here.
 */
export class Athlete {
  private constructor(
    readonly id: string,
    readonly googleSub: string,
    readonly email: string,
    readonly name: string,
    readonly avatarUrl: string | null,
    private currentPreferences: AthletePreferences,
    private administrator: boolean,
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
      false,
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
      new AthletePreferences(
        snapshot.weightUnit,
        snapshot.distanceUnit,
        snapshot.lengthUnit,
        snapshot.showSampleData,
        snapshot.timezone,
        Duration.fromStorage(snapshot.defaultRestSeconds),
      ),
      snapshot.isAdmin,
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
      lengthUnit: this.currentPreferences.lengthUnit,
      showSampleData: this.currentPreferences.showSampleData,
      timezone: this.currentPreferences.timezone,
      defaultRestSeconds: this.currentPreferences.restDuration?.toStorage() ?? null,
      isAdmin: this.administrator,
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

  /** May reach the `/admin` area, and every other athlete's account with it. */
  get isAdmin(): boolean {
    return this.administrator;
  }

  /**
   * Grants or withdraws administrator access. Idempotent, and deliberately
   * unguarded: which athletes may hold the flag at all is a rule about the
   * whole set of them, so `changeAdminAccess` in ./administration.ts decides
   * whether this is allowed to be called.
   */
  changeAdminAccess(isAdmin: boolean, now: Date): void {
    this.administrator = isAdmin;
    this.lastUpdatedAt = now;
  }

  changeUnits(weightUnit: WeightUnit, distanceUnit: DistanceUnit, lengthUnit: LengthUnit, now: Date): void {
    this.currentPreferences = this.currentPreferences.withUnits(weightUnit, distanceUnit, lengthUnit);
    this.lastUpdatedAt = now;
  }

  changeSampleDataVisibility(showSampleData: boolean, now: Date): void {
    this.currentPreferences = this.currentPreferences.withSampleData(showSampleData);
    this.lastUpdatedAt = now;
  }

  changeTimezone(timezone: string, now: Date): void {
    this.currentPreferences = this.currentPreferences.withTimezone(timezone);
    this.lastUpdatedAt = now;
  }

  /** `null` turns the rest timer off. */
  changeRestDuration(restDuration: Duration | null, now: Date): void {
    this.currentPreferences = this.currentPreferences.withRestDuration(restDuration);
    this.lastUpdatedAt = now;
  }
}
