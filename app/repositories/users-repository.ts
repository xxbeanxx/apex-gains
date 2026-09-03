import type { User } from "~/db/schema";

export type NewUser = {
  googleSub: string;
  email: string;
  name: string;
  avatarUrl?: string | null;
};

export type UnitPreferences = {
  weightUnit: "lb" | "kg";
  distanceUnit: "km" | "mi";
};

// Port: consumers (loadUserMiddleware, the OAuth callback, the test-login
// route, settings) depend on this interface, not on Drizzle/Postgres
// directly. See users-repository.server.ts for which adapter backs it at
// runtime.
export interface UsersRepository {
  findById(id: string): Promise<User | null>;
  findByGoogleSub(googleSub: string): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
  create(input: NewUser): Promise<User>;
  updatePreferences(userId: string, input: UnitPreferences): Promise<void>;
  updateShowSampleData(userId: string, showSampleData: boolean): Promise<void>;
}
