import type { Athlete, NewAthlete } from "~/domain/athlete/athlete";

// Port: consumers (loadUserMiddleware, the OAuth callback, the test-login
// route, settings) depend on this interface, not on Drizzle/Postgres
// directly. `server/repositories/repositories.module.ts` picks which
// adapter backs it and exposes the result to the app via load context
// (`athletesRepositoryContext`).
//
// Named for the aggregate rather than the `users` table: what the app cares
// about is the person training and their preferences. Signup is open to any
// Google account and there are no roles, so there is nothing else to a user.
export interface AthletesRepository {
  findById(id: string): Promise<Athlete | null>;
  findByGoogleSub(googleSub: string): Promise<Athlete | null>;
  findByEmail(email: string): Promise<Athlete | null>;
  create(input: NewAthlete): Promise<Athlete>;
  save(athlete: Athlete): Promise<void>;
}
