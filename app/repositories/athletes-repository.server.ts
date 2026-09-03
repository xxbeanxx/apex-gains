import type { Athlete, NewAthlete } from "~/domain/athlete/athlete";

// Port: consumers (loadUserMiddleware, the OAuth callback, the test-login
// route, settings) depend on this interface, not on Drizzle/Postgres
// directly. The factory below picks which adapter backs it at runtime.
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

let repository: AthletesRepository | undefined;

// Ports and adapters: pick the adapter once per process and cache it, so
// the in-memory adapter's state actually persists across requests. The
// adapter modules are imported dynamically (rather than at the top of this
// file) so that importing this factory never pulls in ~/db/index.server -
// which throws at import time when DATABASE_URL is unset - unless a
// database is actually configured.
export async function getAthletesRepository(): Promise<AthletesRepository> {
  if (!repository) {
    repository = process.env.DATABASE_URL
      ? new (
          await import("./drizzle/athletes-repository.server")
        ).DrizzleAthletesRepository()
      : new (
          await import("./in-memory/athletes-repository.server")
        ).InMemoryAthletesRepository();
  }
  return repository;
}
