import { randomUUID } from "node:crypto";

import {
  Athlete,
  type AthleteSnapshot,
  type NewAthlete,
} from "~/domain/athlete/athlete";

import type { AthletesRepository } from "../athletes-repository";

/**
 * Dev-convenience adapter for running the app without a database configured
 * (see athletes-repository.server.ts for the selection rule). Data lives
 * only for the life of the process.
 *
 * Like every in-memory adapter here, it stores aggregate *snapshots* and
 * rebuilds the aggregate on the way out - so a caller can't mutate the store
 * by holding onto something it loaded, which is the one guarantee a real
 * database gives for free.
 */
export class InMemoryAthletesRepository implements AthletesRepository {
  private readonly byId = new Map<string, AthleteSnapshot>();

  async findById(id: string): Promise<Athlete | null> {
    const snapshot = this.byId.get(id);
    return snapshot ? Athlete.fromSnapshot(snapshot) : null;
  }

  async findByGoogleSub(googleSub: string): Promise<Athlete | null> {
    return this.findBy((snapshot) => snapshot.googleSub === googleSub);
  }

  async findByEmail(email: string): Promise<Athlete | null> {
    return this.findBy((snapshot) => snapshot.email === email);
  }

  async create(input: NewAthlete): Promise<Athlete> {
    const now = new Date();
    const snapshot: AthleteSnapshot = {
      id: randomUUID(),
      googleSub: input.googleSub,
      email: input.email,
      name: input.name,
      avatarUrl: input.avatarUrl,
      // Mirrors the column defaults, which is where a new athlete's
      // preferences come from on the Drizzle side.
      weightUnit: "lb",
      distanceUnit: "km",
      showSampleData: true,
      createdAt: now,
      updatedAt: now,
    };
    this.byId.set(snapshot.id, snapshot);
    return Athlete.fromSnapshot(snapshot);
  }

  async save(athlete: Athlete): Promise<void> {
    const snapshot = athlete.toSnapshot();
    this.byId.set(snapshot.id, snapshot);
  }

  private findBy(
    predicate: (snapshot: AthleteSnapshot) => boolean,
  ): Athlete | null {
    const snapshot = [...this.byId.values()].find(predicate);
    return snapshot ? Athlete.fromSnapshot(snapshot) : null;
  }
}
