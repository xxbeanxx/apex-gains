import type { Athlete } from '~domain/athlete/athlete';

// Port: `AthleteService` depends on this interface, not on Drizzle/Postgres
// directly. `server/repositories/repositories.module.ts` picks which adapter
// backs it.
//
// Named for the aggregate rather than the `users` table: what the app cares
// about is the person training, their preferences, and whether they
// administer the instance.
//
// There is no `create`: a new athlete is minted by `Athlete.register` and
// then `save`d, so this adapter never decides what a new account starts as.
export interface AthletesRepository {
  findById(id: string): Promise<Athlete | null>;
  findByGoogleSub(googleSub: string): Promise<Athlete | null>;
  findByEmail(email: string): Promise<Athlete | null>;
  /**
   * Every athlete, oldest account first - the only query in the app that is
   * deliberately not scoped to one user. It backs /admin's user manager, and
   * `requireAdminMiddleware` is what stands between it and anyone else.
   */
  listAll(): Promise<Athlete[]>;
  /** Inserts a newly registered athlete, or updates an existing one. */
  save(athlete: Athlete): Promise<void>;
  /**
   * Closes an account for good. Everything an athlete owns hangs off their
   * `users` row with `on delete cascade`, so this removes their exercises,
   * workouts, plans, sessions and weigh-ins with them.
   */
  remove(athlete: Athlete): Promise<void>;
}
