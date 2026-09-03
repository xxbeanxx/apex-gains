import { eq } from "drizzle-orm";

import { db } from "~/db/index.server";
import { users } from "~/db/schema";

import type {
  NewUser,
  UnitPreferences,
  UsersRepository,
} from "./users-repository";

export class DrizzleUsersRepository implements UsersRepository {
  async findById(id: string) {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, id))
      .limit(1);
    return user ?? null;
  }

  async findByGoogleSub(googleSub: string) {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.googleSub, googleSub))
      .limit(1);
    return user ?? null;
  }

  async findByEmail(email: string) {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    return user ?? null;
  }

  async create(input: NewUser) {
    const [user] = await db.insert(users).values(input).returning();
    return user;
  }

  async updatePreferences(userId: string, input: UnitPreferences) {
    await db
      .update(users)
      .set({
        weightUnit: input.weightUnit,
        distanceUnit: input.distanceUnit,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));
  }

  async updateShowSampleData(userId: string, showSampleData: boolean) {
    await db
      .update(users)
      .set({ showSampleData, updatedAt: new Date() })
      .where(eq(users.id, userId));
  }
}
