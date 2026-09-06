import { closeOwnAccount, type CloseAccountRefusal } from '~domain/athlete/administration';
import { Athlete, type NewAthlete } from '~domain/athlete/athlete';
import { ok, type Result } from '~domain/shared/result';
import { Duration } from '~domain/values/duration';
import type { DistanceUnit, LengthUnit, WeightUnit } from '~domain/values/units';
import type { AthletesRepository } from '~application/ports/persistence/athletes-repository';
import type { UnitOfWork } from '~application/ports/persistence/unit-of-work';

import type { DomainDeps } from '~application/ports/domain-deps';

/** Who signed in, and whether this was their first time. */
export type SignIn = {
  athlete: Athlete;
  isNew: boolean;
};

/**
 * Use cases for an athlete's own account and settings.
 *
 * The settings reach further than they look: the unit preferences decide how
 * every weight and speed in the app is rendered, and the sample-data flag
 * decides what the exercise, workout and plan lists contain.
 */
export class AthleteService {
  constructor(
    private readonly athletes: AthletesRepository,
    private readonly unitOfWork: UnitOfWork,
    private readonly deps: DomainDeps,
  ) {}

  /** The signed-in athlete, or null - what `loadUserMiddleware` resolves. */
  async byId(userId: string): Promise<Athlete | null> {
    return this.athletes.findById(userId);
  }

  /**
   * Signs an athlete in by their Google subject, registering them on first
   * use. Signup is open, so an unrecognised subject is a new account rather
   * than a rejection.
   *
   * The check and the insert are one transaction because two requests can
   * race the first login of the same account; `google_sub` is unique, so the
   * loser's insert fails rather than producing a second athlete.
   */
  async signInWithGoogle(identity: NewAthlete): Promise<SignIn> {
    return this.register(identity, () => this.athletes.findByGoogleSub(identity.googleSub));
  }

  /**
   * The e2e stand-in for `signInWithGoogle`, matching it in every respect
   * except that it identifies the athlete by email, and that it can register
   * the account with admin access already granted - the /admin specs need an
   * administrator, and nothing in the UI can mint the first one. Only ever
   * reachable when ENABLE_TEST_LOGIN is set - see
   * `app/routes/auth.test-login.tsx`.
   *
   * `asAdministrator` applies on registration only, so a returning account
   * keeps whatever access it has now.
   */
  async signInWithEmail(identity: NewAthlete, options: { asAdministrator?: boolean } = {}): Promise<SignIn> {
    return this.register(identity, () => this.athletes.findByEmail(identity.email), options.asAdministrator ?? false);
  }

  async changeUnits(
    athlete: Athlete,
    weightUnit: WeightUnit,
    distanceUnit: DistanceUnit,
    lengthUnit: LengthUnit,
  ): Promise<void> {
    athlete.changeUnits(weightUnit, distanceUnit, lengthUnit, this.deps.clock.now());
    await this.athletes.save(athlete);
  }

  async changeSampleDataVisibility(athlete: Athlete, showSampleData: boolean): Promise<void> {
    athlete.changeSampleDataVisibility(showSampleData, this.deps.clock.now());
    await this.athletes.save(athlete);
  }

  async changeTimezone(athlete: Athlete, timezone: string): Promise<void> {
    athlete.changeTimezone(timezone, this.deps.clock.now());
    await this.athletes.save(athlete);
  }

  /** `null` turns the rest timer off. */
  async changeRestDuration(athlete: Athlete, restSeconds: number | null): Promise<void> {
    athlete.changeRestDuration(restSeconds != null ? Duration.seconds(restSeconds) : null, this.deps.clock.now());
    await this.athletes.save(athlete);
  }

  /**
   * Closes an athlete's own account for good - everything they own goes
   * with it via `on delete cascade`. Not a call into `AdminService`:
   * `closeOwnAccount` is a different rule from `removeAccount`, checked
   * against the whole set of administrators rather than a pair of athletes.
   */
  async closeOwnAccount(athlete: Athlete): Promise<Result<void, CloseAccountRefusal>> {
    const administratorCount = (await this.athletes.listAll()).filter((one) => one.isAdmin).length;

    const outcome = closeOwnAccount(athlete, administratorCount);
    if (!outcome.ok) return outcome;

    await this.athletes.remove(athlete);
    return ok();
  }

  private async register(
    identity: NewAthlete,
    findExisting: () => Promise<Athlete | null>,
    asAdministrator = false,
  ): Promise<SignIn> {
    return this.unitOfWork.run(async () => {
      const existing = await findExisting();
      if (existing) return { athlete: existing, isNew: false };

      const athlete = Athlete.register(identity, this.deps);
      if (asAdministrator) athlete.changeAdminAccess(true, this.deps.clock.now());
      await this.athletes.save(athlete);
      return { athlete, isNew: true };
    });
  }
}
