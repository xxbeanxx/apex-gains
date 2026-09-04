import type { Athlete } from "~/domain/athlete/athlete";

// Port: `AthleteService` depends on this interface, not on Drizzle/Postgres
// directly. `server/repositories/repositories.module.ts` picks which adapter
// backs it.
//
// Named for the aggregate rather than the `users` table: what the app cares
// about is the person training and their preferences. Signup is open to any
// Google account and there are no roles, so there is nothing else to a user.
//
// There is no `create`: a new athlete is minted by `Athlete.register` and
// then `save`d, so this adapter never decides what a new account starts as.
export interface AthletesRepository {
  findById(id: string): Promise<Athlete | null>;
  findByGoogleSub(googleSub: string): Promise<Athlete | null>;
  findByEmail(email: string): Promise<Athlete | null>;
  /** Inserts a newly registered athlete, or updates an existing one. */
  save(athlete: Athlete): Promise<void>;
}
