import type { AthletesRepository } from '~application/ports/persistence/athletes-repository';
import { Athlete, type AthleteSnapshot } from '~domain/athlete/athlete';
import type { AthleteOwned, AthleteReferenced } from '~infrastructure/persistence/in-memory/references';

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
  private readonly owned: AthleteOwned[] = [];
  private readonly referenced: AthleteReferenced[] = [];

  /**
   * Names the stores whose rows hang off `users` with `on delete cascade`.
   * Without them `remove` would leave an account's training behind - see
   * `./references.ts`.
   */
  ownedBy(...stores: AthleteOwned[]): void {
    this.owned.push(...stores);
  }

  /**
   * Names the stores whose rows reference `users` with `on delete set
   * null` - the admin audit trail is the one so far. Without this, `remove`
   * would leave those rows pointing at an id that no longer resolves,
   * instead of nulling the reference the way Postgres does.
   */
  referencedBy(...stores: AthleteReferenced[]): void {
    this.referenced.push(...stores);
  }

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

  async listAll(): Promise<Athlete[]> {
    return [...this.byId.values()].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()).map(Athlete.fromSnapshot);
  }

  async save(athlete: Athlete): Promise<void> {
    const snapshot = athlete.toSnapshot();
    this.byId.set(snapshot.id, snapshot);
  }

  /** Drops the athlete, everything the registered stores hold for them, and nulls out anything that only references them. */
  async remove(athlete: Athlete): Promise<void> {
    this.byId.delete(athlete.id);
    for (const store of this.owned) store.removeAllFor(athlete.id);
    for (const store of this.referenced) store.clearAthlete(athlete.id);
  }

  private findBy(predicate: (snapshot: AthleteSnapshot) => boolean): Athlete | null {
    const snapshot = [...this.byId.values()].find(predicate);
    return snapshot ? Athlete.fromSnapshot(snapshot) : null;
  }
}
