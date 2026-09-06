import { beforeEach, describe, expect, it } from 'vitest';

import { Session } from '~/domain/session/session';
import type { Clock } from '~/domain/shared/clock';
import { Rpe } from '~/domain/values/rpe';
import { Weight } from '~/domain/values/weight';

import { DateOnly, deps, exercise, ids, NOW, seedAthletes, session, type ContractSubject, type RepositorySet } from './harness';

const day = (value: string) => DateOnly.parse(value);

/** Ticks forward a millisecond per call, so sets logged in the same test get distinct `createdAt`s to break ties on. */
function tickingClock(start: Date): Clock {
  let ms = start.getTime();
  return { now: () => new Date(ms++) };
}

export function describeSessionsContract(subject: ContractSubject): void {
  describe('SessionsRepository', () => {
    let repositories: RepositorySet;

    async function seedExercises(): Promise<[string, string]> {
      await repositories.exercises.save(exercise({ id: ids.child, name: 'Bench press' }));
      await repositories.exercises.save(exercise({ id: ids.otherChild, name: 'Squat' }));
      return [ids.child, ids.otherChild];
    }

    /** Opens a day and logs `count` sets of `exerciseId` against it. */
    async function logDay(sessionId: string, date: string, exerciseId: string, count: number, userId = ids.athlete) {
      const opened = await repositories.sessions.add(session({ id: sessionId, userId, date }));
      for (let n = 0; n < count; n++) {
        opened.logSet(exerciseId, { reps: 8 + n, weight: Weight.in('lb', 100 + n) }, deps);
      }
      await repositories.sessions.save(opened);
      return opened;
    }

    beforeEach(async () => {
      repositories = await subject.reset();
      await seedAthletes(repositories);
    });

    describe('add', () => {
      it('opens a day and reads back what the plan said it was', async () => {
        const opened = await repositories.sessions.add(
          session({ id: ids.own, date: '2026-09-03', isRestDay: true, planId: null, workoutId: null }),
        );

        expect(opened.id).toBe(ids.own);
        const found = await repositories.sessions.findForDate(ids.athlete, day('2026-09-03'));
        expect(found?.isRestDay).toBe(true);
      });

      /**
       * Opening a day is idempotent: two requests racing to open the same
       * date must not create two sessions. The unique `(userId, date)`
       * constraint settles it and the loser reads the winner back.
       */
      it('returns the existing session rather than opening a second one for the same day', async () => {
        const first = await repositories.sessions.add(session({ id: ids.own, date: '2026-09-03' }));
        const second = await repositories.sessions.add(session({ id: ids.extra, date: '2026-09-03' }));

        expect(second.id).toBe(first.id);
        expect(await repositories.sessions.listRecent(ids.athlete, 10)).toHaveLength(1);
      });

      it('keeps the sets the winning session already had', async () => {
        const [benchPress] = await seedExercises();
        await logDay(ids.own, '2026-09-03', benchPress, 2);

        const reopened = await repositories.sessions.add(session({ id: ids.extra, date: '2026-09-03' }));

        expect(reopened.setCount).toBe(2);
      });

      it('lets two athletes open the same date independently', async () => {
        await repositories.sessions.add(session({ id: ids.own, date: '2026-09-03' }));
        const theirs = await repositories.sessions.add(
          session({ id: ids.theirs, userId: ids.otherAthlete, date: '2026-09-03' }),
        );

        expect(theirs.id).toBe(ids.theirs);
      });
    });

    describe('sets', () => {
      it('round-trips a strength set with its measurements', async () => {
        const [benchPress] = await seedExercises();
        const opened = await repositories.sessions.add(session({ id: ids.own, date: '2026-09-03' }));
        opened.logSet(benchPress, { reps: 8, weight: Weight.in('lb', 135) }, deps);
        await repositories.sessions.save(opened);

        const found = await repositories.sessions.findForDate(ids.athlete, day('2026-09-03'));

        expect(found?.sets).toHaveLength(1);
        expect(found?.sets[0]!.toSnapshot()).toMatchObject({ exerciseId: benchPress, setNumber: 1, reps: 8 });
        expect(Number(found?.sets[0]!.toSnapshot().weight)).toBe(135);
      });

      it('round-trips notes and an RPE', async () => {
        const [benchPress] = await seedExercises();
        const opened = await repositories.sessions.add(session({ id: ids.own, date: '2026-09-03' }));
        opened.logSet(benchPress, { reps: 8, notes: 'Rod 4 slipping', rpe: Rpe.of(8.5) }, deps);
        await repositories.sessions.save(opened);

        const found = await repositories.sessions.findForDate(ids.athlete, day('2026-09-03'));

        expect(found?.sets[0]!.notes).toBe('Rod 4 slipping');
        expect(found?.sets[0]!.rpe?.value).toBe(8.5);
      });

      it('leaves notes and RPE absent when neither was recorded', async () => {
        const [benchPress] = await seedExercises();
        const opened = await repositories.sessions.add(session({ id: ids.own, date: '2026-09-03' }));
        opened.logSet(benchPress, { reps: 8 }, deps);
        await repositories.sessions.save(opened);

        const found = await repositories.sessions.findForDate(ids.athlete, day('2026-09-03'));

        expect(found?.sets[0]!.notes).toBeNull();
        expect(found?.sets[0]!.rpe).toBeNull();
      });

      it('numbers sets per exercise, in the order they were logged', async () => {
        const [benchPress, squat] = await seedExercises();
        const opened = await repositories.sessions.add(session({ id: ids.own, date: '2026-09-03' }));
        opened.logSet(benchPress, { reps: 8 }, deps);
        opened.logSet(squat, { reps: 5 }, deps);
        opened.logSet(benchPress, { reps: 6 }, deps);
        await repositories.sessions.save(opened);

        const found = await repositories.sessions.findForDate(ids.athlete, day('2026-09-03'));

        expect(found?.setsFor(benchPress).map((set) => set.setNumber)).toEqual([1, 2]);
        expect(found?.setsFor(squat).map((set) => set.setNumber)).toEqual([1]);
      });

      it('drops a removed set and leaves the rest', async () => {
        const [benchPress] = await seedExercises();
        const opened = await logDay(ids.own, '2026-09-03', benchPress, 3);

        opened.removeSet(opened.sets[1]!.id, NOW);
        await repositories.sessions.save(opened);

        const found = await repositories.sessions.findForDate(ids.athlete, day('2026-09-03'));
        expect(found?.setCount).toBe(2);
      });

      it("does not find another athlete's day", async () => {
        await repositories.sessions.add(session({ id: ids.theirs, userId: ids.otherAthlete, date: '2026-09-03' }));

        expect(await repositories.sessions.findForDate(ids.athlete, day('2026-09-03'))).toBeNull();
      });
    });

    describe('listRecent', () => {
      it('returns days newest first, capped at the limit', async () => {
        for (const [id, date] of [
          [ids.own, '2026-09-01'],
          [ids.extra, '2026-09-03'],
          [ids.child, '2026-09-02'],
        ] as const) {
          await repositories.sessions.add(session({ id, date }));
        }

        const dates = (await repositories.sessions.listRecent(ids.athlete, 2)).map((found) => found.date.value);

        expect(dates).toEqual(['2026-09-03', '2026-09-02']);
      });

      it("never returns another athlete's days", async () => {
        await repositories.sessions.add(session({ id: ids.theirs, userId: ids.otherAthlete, date: '2026-09-03' }));

        expect(await repositories.sessions.listRecent(ids.athlete, 10)).toEqual([]);
      });
    });

    describe('listForDateRange', () => {
      it('includes the start and excludes the end', async () => {
        for (const [id, date] of [
          [ids.own, '2026-09-01'],
          [ids.extra, '2026-09-02'],
          [ids.child, '2026-09-03'],
        ] as const) {
          await repositories.sessions.add(session({ id, date }));
        }

        const dates = (await repositories.sessions.listForDateRange(ids.athlete, day('2026-09-01'), day('2026-09-03'))).map(
          (found) => found.date.value,
        );

        expect(dates).toEqual(['2026-09-01', '2026-09-02']);
      });
    });

    describe('recentSetsForExercise', () => {
      it("returns one exercise's sets, newest day first, with the day they fell on", async () => {
        const [benchPress, squat] = await seedExercises();
        await logDay(ids.own, '2026-09-01', benchPress, 1);
        await logDay(ids.extra, '2026-09-03', benchPress, 2);
        await logDay(ids.child, '2026-09-02', squat, 1);

        const recent = await repositories.sessions.recentSetsForExercise(ids.athlete, benchPress, 10);

        expect(recent.map((entry) => entry.date.value)).toEqual(['2026-09-03', '2026-09-03', '2026-09-01']);
      });

      it('caps at the limit', async () => {
        const [benchPress] = await seedExercises();
        await logDay(ids.own, '2026-09-03', benchPress, 5);

        expect(await repositories.sessions.recentSetsForExercise(ids.athlete, benchPress, 2)).toHaveLength(2);
      });

      it("never crosses to another athlete's sets", async () => {
        const [benchPress] = await seedExercises();
        await logDay(ids.theirs, '2026-09-03', benchPress, 2, ids.otherAthlete);

        expect(await repositories.sessions.recentSetsForExercise(ids.athlete, benchPress, 10)).toEqual([]);
      });
    });

    describe('lastSetPerExercise', () => {
      it('returns the newest set for every exercise the athlete has logged', async () => {
        const [benchPress, squat] = await seedExercises();
        await logDay(ids.own, '2026-09-01', benchPress, 1);
        await logDay(ids.extra, '2026-09-02', squat, 1);

        const latest = await repositories.sessions.lastSetPerExercise(ids.athlete, day('2026-09-03'));

        expect(latest.get(benchPress)?.date.value).toBe('2026-09-01');
        expect(latest.get(squat)?.date.value).toBe('2026-09-02');
      });

      it('on the same day, breaks the tie by which set was logged last', async () => {
        const [benchPress] = await seedExercises();
        const opened = await repositories.sessions.add(session({ id: ids.own, date: '2026-09-01' }));
        const ticking = { ...deps, clock: tickingClock(NOW) };
        opened.logSet(benchPress, { reps: 8 }, ticking);
        opened.logSet(benchPress, { reps: 10 }, ticking);
        await repositories.sessions.save(opened);

        const latest = await repositories.sessions.lastSetPerExercise(ids.athlete, day('2026-09-03'));

        expect(latest.get(benchPress)?.set.reps).toBe(10);
      });

      it('excludes sets logged on the viewed date itself', async () => {
        const [benchPress] = await seedExercises();
        await logDay(ids.own, '2026-09-01', benchPress, 1);
        await logDay(ids.extra, '2026-09-03', benchPress, 1);

        const latest = await repositories.sessions.lastSetPerExercise(ids.athlete, day('2026-09-03'));

        expect(latest.get(benchPress)?.date.value).toBe('2026-09-01');
      });

      it('omits an exercise never logged before that date', async () => {
        const [benchPress] = await seedExercises();
        await logDay(ids.own, '2026-09-03', benchPress, 1);

        expect((await repositories.sessions.lastSetPerExercise(ids.athlete, day('2026-09-03'))).size).toBe(0);
      });

      it("never crosses to another athlete's sets", async () => {
        const [benchPress] = await seedExercises();
        await logDay(ids.theirs, '2026-09-01', benchPress, 1, ids.otherAthlete);

        expect((await repositories.sessions.lastSetPerExercise(ids.athlete, day('2026-09-03'))).size).toBe(0);
      });
    });

    describe('trainingTotals', () => {
      it('counts workouts and sets per athlete, with the last day they were active', async () => {
        const [benchPress] = await seedExercises();
        await logDay(ids.own, '2026-09-01', benchPress, 2);
        await logDay(ids.extra, '2026-09-03', benchPress, 3);
        await logDay(ids.theirs, '2026-09-02', benchPress, 1, ids.otherAthlete);

        const totals = await repositories.sessions.trainingTotals();

        expect(totals.get(ids.athlete)).toMatchObject({ workoutCount: 2, setCount: 5 });
        expect(totals.get(ids.athlete)?.lastActiveOn?.value).toBe('2026-09-03');
        expect(totals.get(ids.otherAthlete)).toMatchObject({ workoutCount: 1, setCount: 1 });
      });

      it('counts a rest day as activity but not as a workout', async () => {
        await repositories.sessions.add(session({ id: ids.own, date: '2026-09-03', isRestDay: true }));

        const totals = await repositories.sessions.trainingTotals();

        expect(totals.get(ids.athlete)).toMatchObject({ workoutCount: 0, setCount: 0 });
        expect(totals.get(ids.athlete)?.lastActiveOn?.value).toBe('2026-09-03');
      });

      it('omits an athlete who has never opened a day, rather than zeroing them', async () => {
        expect((await repositories.sessions.trainingTotals()).has(ids.athlete)).toBe(false);
      });
    });

    it('snapshots the plan, so a later plan change cannot rewrite the day', async () => {
      const opened = Session.open(
        ids.athlete,
        day('2026-09-03'),
        { planId: null, workoutId: null, isRestDay: true },
        { ids: { next: () => ids.own }, clock: { now: () => NOW } },
      );
      await repositories.sessions.add(opened);

      const found = await repositories.sessions.findForDate(ids.athlete, day('2026-09-03'));
      expect(found?.toSnapshot()).toMatchObject({ planId: null, workoutId: null, isRestDay: true });
    });
  });
}
