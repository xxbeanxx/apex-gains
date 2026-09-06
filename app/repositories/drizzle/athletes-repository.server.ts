import { asc, eq } from 'drizzle-orm';

import { dbScope } from '~/db/index.server';
import { users, type User } from '~/db/schema';
import { Athlete } from '~/domain/athlete/athlete';

import type { AthletesRepository } from '../athletes-repository.server';

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
    timezone: row.timezone,
    defaultRestSeconds: row.defaultRestSeconds,
    isAdmin: row.isAdmin,
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

  async listAll(): Promise<Athlete[]> {
    const rows = await dbScope.query.users.findMany({
      orderBy: asc(users.createdAt),
    });
    return rows.map(toAthlete);
  }

  async save(athlete: Athlete): Promise<void> {
    const snapshot = athlete.toSnapshot();
    await dbScope
      .insert(users)
      .values({
        id: snapshot.id,
        googleSub: snapshot.googleSub,
        email: snapshot.email,
        name: snapshot.name,
        avatarUrl: snapshot.avatarUrl,
        weightUnit: snapshot.weightUnit,
        distanceUnit: snapshot.distanceUnit,
        showSampleData: snapshot.showSampleData,
        timezone: snapshot.timezone,
        defaultRestSeconds: snapshot.defaultRestSeconds,
        isAdmin: snapshot.isAdmin,
        createdAt: snapshot.createdAt,
        updatedAt: snapshot.updatedAt,
      })
      // Identity comes from Google and is not editable here, so an update
      // only ever writes the preferences, the admin flag and the stamp.
      .onConflictDoUpdate({
        target: users.id,
        set: {
          weightUnit: snapshot.weightUnit,
          distanceUnit: snapshot.distanceUnit,
          showSampleData: snapshot.showSampleData,
          timezone: snapshot.timezone,
          defaultRestSeconds: snapshot.defaultRestSeconds,
          isAdmin: snapshot.isAdmin,
          updatedAt: snapshot.updatedAt,
        },
      });
  }

  async remove(athlete: Athlete): Promise<void> {
    await dbScope.delete(users).where(eq(users.id, athlete.id));
  }
}
