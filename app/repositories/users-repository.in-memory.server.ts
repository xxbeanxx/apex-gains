import { randomUUID } from "node:crypto";

import type { User } from "~/db/schema";

import type {
  NewUser,
  UnitPreferences,
  UsersRepository,
} from "./users-repository";

// Dev-convenience adapter for running the app without a database
// configured (see users-repository.server.ts for the selection rule). It
// does not enforce the unique constraints Postgres would on googleSub/
// email - callers that need that guarantee belong on the Drizzle adapter.
// Data lives only for the life of the process.
export class InMemoryUsersRepository implements UsersRepository {
  private readonly usersById = new Map<string, User>();

  async findById(id: string) {
    return this.usersById.get(id) ?? null;
  }

  async findByGoogleSub(googleSub: string) {
    return this.findOne((user) => user.googleSub === googleSub);
  }

  async findByEmail(email: string) {
    return this.findOne((user) => user.email === email);
  }

  async create(input: NewUser): Promise<User> {
    const now = new Date();
    const user: User = {
      id: randomUUID(),
      googleSub: input.googleSub,
      email: input.email,
      name: input.name,
      avatarUrl: input.avatarUrl ?? null,
      weightUnit: "lb",
      distanceUnit: "km",
      showSampleData: true,
      createdAt: now,
      updatedAt: now,
    };
    this.usersById.set(user.id, user);
    return user;
  }

  async updatePreferences(userId: string, input: UnitPreferences) {
    const user = this.usersById.get(userId);
    if (!user) return;
    this.usersById.set(userId, {
      ...user,
      weightUnit: input.weightUnit,
      distanceUnit: input.distanceUnit,
      updatedAt: new Date(),
    });
  }

  async updateShowSampleData(userId: string, showSampleData: boolean) {
    const user = this.usersById.get(userId);
    if (!user) return;
    this.usersById.set(userId, {
      ...user,
      showSampleData,
      updatedAt: new Date(),
    });
  }

  private findOne(predicate: (user: User) => boolean): User | null {
    for (const user of this.usersById.values()) {
      if (predicate(user)) return user;
    }
    return null;
  }
}
