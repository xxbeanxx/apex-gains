import { beforeEach, describe, expect, it } from 'vitest';

import { Athlete } from '~domain/athlete/athlete';
import { Duration } from '~domain/values/duration';

import {
  athlete,
  DateOnly,
  NOW,
  Weight,
  deps,
  equipmentItem,
  exercise,
  ids,
  measurement,
  seedAthletes,
  session,
  weighIn,
  type ContractSubject,
  type RepositorySet,
} from './harness';

const day = (value: string) => DateOnly.parse(value);

export function describeAthletesContract(subject: ContractSubject): void {
  describe('AthletesRepository', () => {
    let repositories: RepositorySet;

    beforeEach(async () => {
      repositories = await subject.reset();
    });

    it('round-trips an athlete and their preferences', async () => {
      const registered = athlete(ids.athlete, { email: 'a@example.com', googleSub: 'sub-1' });
      registered.changeUnits('kg', 'mi', 'cm', NOW);
      registered.changeTimezone('America/Toronto', NOW);
      await repositories.athletes.save(registered);

      const found = await repositories.athletes.findById(ids.athlete);

      expect(found?.toSnapshot()).toMatchObject({
        id: ids.athlete,
        email: 'a@example.com',
        googleSub: 'sub-1',
        weightUnit: 'kg',
        distanceUnit: 'mi',
        timezone: 'America/Toronto',
      });
    });

    it('round-trips a rest duration, and null once the timer is turned back off', async () => {
      const registered = athlete(ids.athlete);
      registered.changeRestDuration(Duration.seconds(90), NOW);
      await repositories.athletes.save(registered);

      expect((await repositories.athletes.findById(ids.athlete))?.preferences.restDuration?.inSeconds).toBe(90);

      registered.changeRestDuration(null, NOW);
      await repositories.athletes.save(registered);

      expect((await repositories.athletes.findById(ids.athlete))?.preferences.restDuration).toBeNull();
    });

    it('finds an athlete by their Google subject and by email', async () => {
      await repositories.athletes.save(athlete(ids.athlete, { email: 'a@example.com', googleSub: 'sub-1' }));

      expect((await repositories.athletes.findByGoogleSub('sub-1'))?.id).toBe(ids.athlete);
      expect((await repositories.athletes.findByEmail('a@example.com'))?.id).toBe(ids.athlete);
      expect(await repositories.athletes.findByGoogleSub('sub-missing')).toBeNull();
      expect(await repositories.athletes.findByEmail('nobody@example.com')).toBeNull();
    });

    it('saves an existing athlete as an update, not a second row', async () => {
      const registered = athlete(ids.athlete);
      await repositories.athletes.save(registered);
      registered.changeUnits('kg', 'mi', 'cm', NOW);
      await repositories.athletes.save(registered);

      expect(await repositories.athletes.listAll()).toHaveLength(1);
    });

    it('lists every athlete, oldest account first', async () => {
      await repositories.athletes.save(
        Athlete.fromSnapshot({ ...athlete(ids.otherAthlete).toSnapshot(), createdAt: new Date('2026-09-01T00:00:00Z') }),
      );
      await repositories.athletes.save(
        Athlete.fromSnapshot({ ...athlete(ids.athlete).toSnapshot(), createdAt: new Date('2026-08-01T00:00:00Z') }),
      );

      expect((await repositories.athletes.listAll()).map((found) => found.id)).toEqual([ids.athlete, ids.otherAthlete]);
    });

    it('removes an account and everything hanging off it', async () => {
      await seedAthletes(repositories);
      await repositories.bodyWeight.save(weighIn(ids.own, '2026-09-03', 180));
      await repositories.bodyMeasurements.save(measurement(ids.own, '2026-09-03', 'waist', 80));

      await repositories.athletes.remove(athlete(ids.athlete));

      expect(await repositories.athletes.findById(ids.athlete)).toBeNull();
      expect(await repositories.bodyWeight.listRecent(ids.athlete, 10)).toEqual([]);
      expect(await repositories.bodyMeasurements.listAll(ids.athlete)).toEqual([]);
      // Only that account: the other athlete is untouched.
      expect(await repositories.athletes.findById(ids.otherAthlete)).not.toBeNull();
    });

    /**
     * `session_sets.exercise_id` is `on delete restrict`, while `exercises`
     * and `sessions` both cascade from `users`. Postgres does not order two
     * independent cascade paths against each other, so an athlete who logged
     * a set against an exercise they own must still be deletable.
     */
    it('removes an account that logged a set against its own exercise', async () => {
      await seedAthletes(repositories);
      await repositories.exercises.save(exercise({ id: ids.own, userId: ids.athlete }));
      const opened = await repositories.sessions.add(session({ id: ids.own, userId: ids.athlete }));
      opened.logSet(ids.own, { reps: 8, weight: Weight.in('lb', 135) }, deps);
      await repositories.sessions.save(opened);

      await repositories.athletes.remove(athlete(ids.athlete));

      expect(await repositories.athletes.findById(ids.athlete)).toBeNull();
    });
  });
}

export function describeEquipmentContract(subject: ContractSubject): void {
  describe('EquipmentRepository', () => {
    let repositories: RepositorySet;

    beforeEach(async () => {
      repositories = await subject.reset();
      await seedAthletes(repositories);
    });

    it('lists own equipment plus samples, alphabetically', async () => {
      await repositories.equipment.save(equipmentItem(ids.own, 'Treadmill'));
      await repositories.equipment.save(equipmentItem(ids.sample, 'Barbell', null));
      await repositories.equipment.save(equipmentItem(ids.theirs, 'Kettlebell', ids.otherAthlete));

      const names = (await repositories.equipment.listFor(ids.athlete, true)).map((found) => found.name);

      expect(names).toEqual(['Barbell', 'Treadmill']);
    });

    /** Equipment has no fork-on-write rule, so hiding samples hides them all. */
    it('lists only own equipment when sample data is hidden', async () => {
      await repositories.equipment.save(equipmentItem(ids.own, 'Treadmill'));
      await repositories.equipment.save(equipmentItem(ids.sample, 'Barbell', null));

      expect((await repositories.equipment.listFor(ids.athlete, false)).map((found) => found.name)).toEqual(['Treadmill']);
    });

    it('finds by name across every athlete, since names are globally unique', async () => {
      await repositories.equipment.save(equipmentItem(ids.theirs, 'Kettlebell', ids.otherAthlete));

      expect((await repositories.equipment.findByName('Kettlebell'))?.id).toBe(ids.theirs);
      expect(await repositories.equipment.findByName('Nothing')).toBeNull();
    });

    it('finds many by id regardless of who owns them', async () => {
      await repositories.equipment.save(equipmentItem(ids.sample, 'Barbell', null));
      await repositories.equipment.save(equipmentItem(ids.theirs, 'Kettlebell', ids.otherAthlete));

      const found = await repositories.equipment.findManyByIds([ids.sample, ids.theirs]);

      expect(found.map((one) => one.id).sort()).toEqual([ids.sample, ids.theirs].sort());
      expect(await repositories.equipment.findManyByIds([])).toEqual([]);
    });

    it('round-trips a cardio kind', async () => {
      const item = equipmentItem(ids.own, 'Treadmill');
      item.setCardioKind('speed');
      await repositories.equipment.save(item);

      expect((await repositories.equipment.findById(ids.own))?.cardioKind).toBe('speed');
    });

    it('deletes equipment', async () => {
      await repositories.equipment.save(equipmentItem(ids.own, 'Treadmill'));

      await repositories.equipment.delete(ids.own);

      expect(await repositories.equipment.findById(ids.own)).toBeNull();
    });
  });
}

export function describeBodyWeightContract(subject: ContractSubject): void {
  describe('BodyWeightRepository', () => {
    let repositories: RepositorySet;

    beforeEach(async () => {
      repositories = await subject.reset();
      await seedAthletes(repositories);
    });

    it('round-trips a weigh-in as a calendar day and a canonical weight', async () => {
      await repositories.bodyWeight.save(weighIn(ids.own, '2026-09-03', 180.5));

      const found = await repositories.bodyWeight.findForDate(ids.athlete, day('2026-09-03'));

      expect(found?.date.value).toBe('2026-09-03');
      expect(found?.weight.as('lb')).toBeCloseTo(180.5, 2);
    });

    /**
     * At most one entry per athlete per day - the `(userId, date)` unique
     * constraint is what makes re-logging a day a correction rather than a
     * duplicate.
     */
    it('corrects a day rather than adding a second entry for it', async () => {
      const entry = weighIn(ids.own, '2026-09-03', 180);
      await repositories.bodyWeight.save(entry);
      entry.correctTo(weighIn(ids.own, '2026-09-03', 178).weight);
      await repositories.bodyWeight.save(entry);

      const listed = await repositories.bodyWeight.listRecent(ids.athlete, 10);

      expect(listed).toHaveLength(1);
      expect(listed[0]!.weight.as('lb')).toBeCloseTo(178, 2);
    });

    it('lists newest day first, capped at the limit', async () => {
      await repositories.bodyWeight.save(weighIn(ids.own, '2026-09-01', 181));
      await repositories.bodyWeight.save(weighIn(ids.extra, '2026-09-03', 179));
      await repositories.bodyWeight.save(weighIn(ids.child, '2026-09-02', 180));

      const dates = (await repositories.bodyWeight.listRecent(ids.athlete, 2)).map((found) => found.date.value);

      expect(dates).toEqual(['2026-09-03', '2026-09-02']);
    });

    it("never returns another athlete's weigh-ins", async () => {
      await repositories.bodyWeight.save(weighIn(ids.theirs, '2026-09-03', 200, ids.otherAthlete));

      expect(await repositories.bodyWeight.listRecent(ids.athlete, 10)).toEqual([]);
      expect(await repositories.bodyWeight.findForDate(ids.athlete, day('2026-09-03'))).toBeNull();
    });

    it('listAll returns every entry, newest first, uncapped', async () => {
      await repositories.bodyWeight.save(weighIn(ids.own, '2026-09-01', 181));
      await repositories.bodyWeight.save(weighIn(ids.extra, '2026-09-03', 179));
      await repositories.bodyWeight.save(weighIn(ids.child, '2026-09-02', 180));

      const dates = (await repositories.bodyWeight.listAll(ids.athlete)).map((found) => found.date.value);

      expect(dates).toEqual(['2026-09-03', '2026-09-02', '2026-09-01']);
    });

    it('deletes an entry', async () => {
      await repositories.bodyWeight.save(weighIn(ids.own, '2026-09-03', 180));

      await repositories.bodyWeight.delete(ids.own);

      expect(await repositories.bodyWeight.findForDate(ids.athlete, day('2026-09-03'))).toBeNull();
    });
  });
}

export function describeBodyMeasurementsContract(subject: ContractSubject): void {
  describe('BodyMeasurementsRepository', () => {
    let repositories: RepositorySet;

    beforeEach(async () => {
      repositories = await subject.reset();
      await seedAthletes(repositories);
    });

    it('round-trips a measurement as a calendar day and a canonical length', async () => {
      await repositories.bodyMeasurements.save(measurement(ids.own, '2026-09-03', 'waist', 86.36));

      const found = await repositories.bodyMeasurements.findForDate(ids.athlete, day('2026-09-03'), 'waist');

      expect(found?.date.value).toBe('2026-09-03');
      expect(found?.metric).toBe('waist');
      expect(found?.value.as('cm')).toBeCloseTo(86.36, 2);
    });

    /**
     * At most one entry per athlete per day per metric - the `(userId, date,
     * metric)` unique constraint is what makes re-logging a metric on a day a
     * correction rather than a duplicate.
     */
    it('corrects a day rather than adding a second entry for it', async () => {
      const entry = measurement(ids.own, '2026-09-03', 'waist', 86);
      await repositories.bodyMeasurements.save(entry);
      entry.correctTo(measurement(ids.own, '2026-09-03', 'waist', 85).value);
      await repositories.bodyMeasurements.save(entry);

      const listed = await repositories.bodyMeasurements.listRecent(ids.athlete, 'waist', 10);

      expect(listed).toHaveLength(1);
      expect(listed[0]!.value.as('cm')).toBeCloseTo(85, 2);
    });

    /** A different metric on the same day is a separate entry, not a collision. */
    it('keeps different metrics on the same day as separate entries', async () => {
      await repositories.bodyMeasurements.save(measurement(ids.own, '2026-09-03', 'waist', 86));
      await repositories.bodyMeasurements.save(measurement(ids.child, '2026-09-03', 'chest', 102));

      expect(await repositories.bodyMeasurements.listRecent(ids.athlete, 'waist', 10)).toHaveLength(1);
      expect(await repositories.bodyMeasurements.listRecent(ids.athlete, 'chest', 10)).toHaveLength(1);
    });

    it('lists newest day first, capped at the limit, scoped to the metric', async () => {
      await repositories.bodyMeasurements.save(measurement(ids.own, '2026-09-01', 'waist', 87));
      await repositories.bodyMeasurements.save(measurement(ids.extra, '2026-09-03', 'waist', 85));
      await repositories.bodyMeasurements.save(measurement(ids.child, '2026-09-02', 'waist', 86));
      await repositories.bodyMeasurements.save(measurement(ids.fork, '2026-09-03', 'chest', 100));

      const dates = (await repositories.bodyMeasurements.listRecent(ids.athlete, 'waist', 2)).map((found) => found.date.value);

      expect(dates).toEqual(['2026-09-03', '2026-09-02']);
    });

    it("never returns another athlete's measurements", async () => {
      await repositories.bodyMeasurements.save(measurement(ids.theirs, '2026-09-03', 'waist', 90, ids.otherAthlete));

      expect(await repositories.bodyMeasurements.listRecent(ids.athlete, 'waist', 10)).toEqual([]);
      expect(await repositories.bodyMeasurements.findForDate(ids.athlete, day('2026-09-03'), 'waist')).toBeNull();
    });

    it('listAll returns every entry across every metric, newest first, uncapped', async () => {
      await repositories.bodyMeasurements.save(measurement(ids.own, '2026-09-01', 'waist', 87));
      await repositories.bodyMeasurements.save(measurement(ids.extra, '2026-09-03', 'chest', 101));
      await repositories.bodyMeasurements.save(measurement(ids.child, '2026-09-02', 'waist', 86));

      const dates = (await repositories.bodyMeasurements.listAll(ids.athlete)).map((found) => found.date.value);

      expect(dates).toEqual(['2026-09-03', '2026-09-02', '2026-09-01']);
    });

    it('deletes an entry', async () => {
      await repositories.bodyMeasurements.save(measurement(ids.own, '2026-09-03', 'waist', 86));

      await repositories.bodyMeasurements.delete(ids.own);

      expect(await repositories.bodyMeasurements.findForDate(ids.athlete, day('2026-09-03'), 'waist')).toBeNull();
    });
  });
}

export function describeUnitOfWorkContract(subject: ContractSubject): void {
  describe('UnitOfWork', () => {
    let repositories: RepositorySet;

    beforeEach(async () => {
      repositories = await subject.reset();
      await seedAthletes(repositories);
    });

    it('returns what the work returns', async () => {
      expect(await repositories.unitOfWork.run(async () => 'done')).toBe('done');
    });

    it('commits writes made inside it', async () => {
      await repositories.unitOfWork.run(() => repositories.equipment.save(equipmentItem(ids.own, 'Treadmill')));

      expect(await repositories.equipment.findById(ids.own)).not.toBeNull();
    });

    it('propagates a throw from the work', async () => {
      await expect(
        repositories.unitOfWork.run(async () => {
          throw new Error('nope');
        }),
      ).rejects.toThrow('nope');
    });

    /**
     * Nesting is flattened rather than opening a savepoint: an inner scope
     * joins the outer one, so a failure anywhere unwinds the whole thing.
     */
    it('joins a nested scope to the outer one', async () => {
      const returned = await repositories.unitOfWork.run(() =>
        repositories.unitOfWork.run(async () => {
          await repositories.equipment.save(equipmentItem(ids.own, 'Treadmill'));
          return 'inner';
        }),
      );

      expect(returned).toBe('inner');
      expect(await repositories.equipment.findById(ids.own)).not.toBeNull();
    });
  });
}
