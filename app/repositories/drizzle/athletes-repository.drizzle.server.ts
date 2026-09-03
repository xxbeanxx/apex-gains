import { eq } from "drizzle-orm";

import { db, dbScope } from "~/db/index.server";
import { users, type User } from "~/db/schema";
import { Athlete, type NewAthlete } from "~/domain/athlete/athlete";

import type { AthletesRepository } from "../athletes-repository.server";

function toAthlete(row: User): Athlete {
  return Athlete.fromSnapshot({
    id: row.id,
    googleSub: row.googleSub,
    email: row.email,
    name: row.name,
    avatarUrl: row.avatarUrl,
    weightUnit: row.weightUnit,
    distanceUnit: row.distanceUnit,
    showSampleData: row.showSampleData,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

export class DrizzleAthletesRepository implements AthletesRepository {
  async findById(id: string): Promise<Athlete | null> {
    const row = await dbScope.query.users.findFirst({
      where: eq(users.id, id),
    });
    return row ? toAthlete(row) : null;
  }

  async findByGoogleSub(googleSub: string): Promise<Athlete | null> {
    const row = await dbScope.query.users.findFirst({
      where: eq(users.googleSub, googleSub),
    });
    return row ? toAthlete(row) : null;
  }

  async findByEmail(email: string): Promise<Athlete | null> {
    const row = await dbScope.query.users.findFirst({
      where: eq(users.email, email),
    });
    return row ? toAthlete(row) : null;
  }

  async create(input: NewAthlete): Promise<Athlete> {
    // Preferences and timestamps take their column defaults; a new athlete
    // starts on `AthletePreferences.defaults()` by construction.
    const [row] = await db
      .insert(users)
      .values({
        googleSub: input.googleSub,
        email: input.email,
        name: input.name,
        avatarUrl: input.avatarUrl,
      })
      .returning();
    return toAthlete(row);
  }

  async save(athlete: Athlete): Promise<void> {
    const snapshot = athlete.toSnapshot();
    await dbScope
      .update(users)
      .set({
        weightUnit: snapshot.weightUnit,
        distanceUnit: snapshot.distanceUnit,
        showSampleData: snapshot.showSampleData,
        updatedAt: snapshot.updatedAt,
      })
      .where(eq(users.id, snapshot.id));
  }
}
