import { beforeEach, describe, expect, it } from 'vitest';

import { type ContractSubject, type RepositorySet, exercise, ids, plan, seedAthletes, workout } from './harness';

/**
 * What `LibraryVisibility` promises, asked of a real adapter.
 *
 * Exercises, workouts and plans answer the same three questions - what
 * does a list show, what can be fetched by id, and which fork stands in for
 * which sample - so they are asked once and run three times. The Drizzle
 * side reads the rule out of a `where` clause and the in-memory side out of
 * `selectFrom`; this is the only place the two are made to agree.
 */
type Library = {
  readonly label: string;
  /** A row owned by `userId`, or a sample when `userId` is null. */
  make(id: string, userId: string | null, forkedFromId?: string | null): unknown;
  save(repositories: RepositorySet, aggregate: unknown): Promise<void>;
  listFor(repositories: RepositorySet, userId: string, showSampleData: boolean): Promise<{ id: string }[]>;
  findVisible(repositories: RepositorySet, userId: string, id: string): Promise<{ id: string } | null>;
  findForkOf(repositories: RepositorySet, userId: string, sampleId: string): Promise<{ id: string } | null>;
};

const libraries: Library[] = [
  {
    label: 'exercises',
    make: (id, userId, forkedFromId = null) => exercise({ id, userId, forkedFromId, name: `Exercise ${id.slice(0, 4)}` }),
    save: (r, a) => r.exercises.save(a as never),
    listFor: (r, userId, show) => r.exercises.listFor(userId, show),
    findVisible: (r, userId, id) => r.exercises.findVisible(userId, id),
    findForkOf: (r, userId, sampleId) => r.exercises.findForkOf(userId, sampleId),
  },
  {
    label: 'workouts',
    make: (id, userId, forkedFromId = null) => workout({ id, userId, forkedFromId, name: `Workout ${id.slice(0, 4)}` }),
    save: (r, a) => r.workouts.save(a as never),
    listFor: (r, userId, show) => r.workouts.listFor(userId, show),
    findVisible: (r, userId, id) => r.workouts.findVisible(userId, id),
    findForkOf: (r, userId, sampleId) => r.workouts.findForkOf(userId, sampleId),
  },
  {
    label: 'plans',
    make: (id, userId, forkedFromId = null) => plan({ id, userId, forkedFromId, name: `Plan ${id.slice(0, 4)}` }),
    save: (r, a) => r.plans.save(a as never),
    listFor: (r, userId, show) => r.plans.listFor(userId, show),
    findVisible: (r, userId, id) => r.plans.findVisible(userId, id),
    findForkOf: (r, userId, sampleId) => r.plans.findForkOf(userId, sampleId),
  },
];

export function describeForkableLibraryContract(subject: ContractSubject): void {
  describe.each(libraries)('$label: visibility and forks', (library) => {
    let repositories: RepositorySet;

    async function seed(rows: [id: string, userId: string | null, forkedFromId?: string | null][]): Promise<void> {
      for (const [id, userId, forkedFromId] of rows) {
        await library.save(repositories, library.make(id, userId, forkedFromId));
      }
    }

    async function listedIds(userId: string, showSampleData: boolean): Promise<string[]> {
      const rows = await library.listFor(repositories, userId, showSampleData);
      return rows.map((row) => row.id).sort();
    }

    beforeEach(async () => {
      repositories = await subject.reset();
      await seedAthletes(repositories);
    });

    it('lists own rows and every sample when sample data is shown', async () => {
      await seed([
        [ids.own, ids.athlete],
        [ids.sample, null],
        [ids.otherSample, null],
      ]);

      expect(await listedIds(ids.athlete, true)).toEqual([ids.own, ids.sample, ids.otherSample].sort());
    });

    it('lists only own rows when sample data is hidden', async () => {
      await seed([
        [ids.own, ids.athlete],
        [ids.sample, null],
      ]);

      expect(await listedIds(ids.athlete, false)).toEqual([ids.own]);
    });

    it('hides a sample the athlete has forked, so it is not listed twice', async () => {
      await seed([
        [ids.sample, null],
        [ids.otherSample, null],
        [ids.fork, ids.athlete, ids.sample],
      ]);

      expect(await listedIds(ids.athlete, true)).toEqual([ids.fork, ids.otherSample].sort());
    });

    it('still lists a sample another athlete has forked', async () => {
      await seed([
        [ids.sample, null],
        [ids.theirs, ids.otherAthlete, ids.sample],
      ]);

      expect(await listedIds(ids.athlete, true)).toEqual([ids.sample]);
    });

    it("never lists another athlete's rows", async () => {
      await seed([
        [ids.own, ids.athlete],
        [ids.theirs, ids.otherAthlete],
      ]);

      expect(await listedIds(ids.athlete, true)).toEqual([ids.own]);
      expect(await listedIds(ids.athlete, false)).toEqual([ids.own]);
    });

    it('finds own rows and samples by id', async () => {
      await seed([
        [ids.own, ids.athlete],
        [ids.sample, null],
      ]);

      expect((await library.findVisible(repositories, ids.athlete, ids.own))?.id).toBe(ids.own);
      expect((await library.findVisible(repositories, ids.athlete, ids.sample))?.id).toBe(ids.sample);
    });

    it("does not find another athlete's row by id", async () => {
      await seed([[ids.theirs, ids.otherAthlete]]);

      expect(await library.findVisible(repositories, ids.athlete, ids.theirs)).toBeNull();
    });

    it('still finds a forked sample by id, though the list hides it', async () => {
      await seed([
        [ids.sample, null],
        [ids.fork, ids.athlete, ids.sample],
      ]);

      expect(await listedIds(ids.athlete, true)).toEqual([ids.fork]);
      expect((await library.findVisible(repositories, ids.athlete, ids.sample))?.id).toBe(ids.sample);
    });

    it('is null for an id that does not exist', async () => {
      expect(await library.findVisible(repositories, ids.athlete, ids.extra)).toBeNull();
    });

    it("finds the athlete's own fork of a sample", async () => {
      await seed([
        [ids.sample, null],
        [ids.fork, ids.athlete, ids.sample],
      ]);

      expect((await library.findForkOf(repositories, ids.athlete, ids.sample))?.id).toBe(ids.fork);
    });

    it("does not mistake another athlete's fork for the athlete's own", async () => {
      await seed([
        [ids.sample, null],
        [ids.theirs, ids.otherAthlete, ids.sample],
      ]);

      expect(await library.findForkOf(repositories, ids.athlete, ids.sample)).toBeNull();
    });

    it('is null when the athlete has not forked the sample', async () => {
      await seed([[ids.sample, null]]);

      expect(await library.findForkOf(repositories, ids.athlete, ids.sample)).toBeNull();
    });
  });
}
