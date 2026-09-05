import { beforeEach, describe, expect, it } from 'vitest';

import { Athlete, type AthleteSnapshot } from '~/domain/athlete/athlete';
import { Exercise } from '~/domain/exercise/exercise';
import { Plan } from '~/domain/plan/plan';
import { fixedClock } from '~/domain/shared/clock';
import { sequentialIds } from '~/domain/shared/ids';
import { sequentialSecrets } from '~/domain/shared/secrets';
import { SetTarget } from '~/domain/workout/set-target';
import { Workout } from '~/domain/workout/workout';
import { DateOnly } from '~/domain/values/date-only';
import { Weight } from '~/domain/values/weight';
import { InMemoryAthletesRepository } from '~/repositories/in-memory/athletes-repository.server';
import { InMemoryExercisesRepository } from '~/repositories/in-memory/exercises-repository.server';
import { InMemoryPlansRepository } from '~/repositories/in-memory/plans-repository.server';
import { InMemoryWorkoutsRepository } from '~/repositories/in-memory/workouts-repository.server';
import { InMemoryUnitOfWork } from '~/repositories/in-memory/unit-of-work.server';

import { PlanImportService } from './plan-import-service.server';

const NOW = new Date('2026-09-03T12:00:00Z');
const IMPORT_DATE = DateOnly.parse('2026-10-01');

function athlete(overrides: Partial<AthleteSnapshot> = {}): Athlete {
  return Athlete.fromSnapshot({
    id: 'importer',
    googleSub: 'google-importer',
    email: 'importer@example.com',
    name: 'Importer',
    avatarUrl: null,
    weightUnit: 'lb',
    distanceUnit: 'km',
    showSampleData: true,
    timezone: 'UTC',
    isAdmin: false,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  });
}

const importer = athlete();
const sharer = athlete({ id: 'sharer', googleSub: 'google-sharer', email: 'sharer@example.com', name: 'Dana' });

let athletes: InMemoryAthletesRepository;
let plans: InMemoryPlansRepository;
let workouts: InMemoryWorkoutsRepository;
let exercises: InMemoryExercisesRepository;
let service: PlanImportService;

/**
 * A fresh id generator per store family, so an id minted for a copy can never
 * collide with one the fixtures already handed out.
 */
function deps(prefix: string) {
  return { ids: sequentialIds(prefix), clock: fixedClock(NOW), secrets: sequentialSecrets(`${prefix}-token`) };
}

/** Dana's own exercise, workout and plan, shared under one token. */
async function seedSharedPlan(options: { exerciseForkedFrom?: string | null } = {}): Promise<string> {
  const exercise = Exercise.fromSnapshot({
    id: 'their-bench',
    userId: sharer.id,
    forkedFromId: options.exerciseForkedFrom ?? null,
    name: 'Bench Press',
    exerciseType: 'strength',
    muscleGroup: 'chest',
    description: null,
    createdAt: NOW,
    equipmentIds: ['barbell'],
  });
  await exercises.save(exercise);

  const workout = Workout.create(sharer.id, 'Push Day', deps('their-workout'));
  workout.addExercise(exercise.id, SetTarget.of({ sets: 3, reps: 10, weight: Weight.lb(135) }), deps('their-entry'));
  await workouts.save(workout);

  const plan = Plan.create(sharer.id, 'Dana PPL', DateOnly.parse('2026-09-01'), deps('their-plan'));
  plan.addSlot(workout.id, deps('their-slot-a'));
  plan.addSlot(null, deps('their-slot-b'));
  const token = plan.share(deps('their-share'));
  await plans.save(plan);

  return token;
}

beforeEach(async () => {
  athletes = new InMemoryAthletesRepository();
  plans = new InMemoryPlansRepository();
  workouts = new InMemoryWorkoutsRepository();
  exercises = new InMemoryExercisesRepository();
  exercises.referencedBy(workouts);

  await athletes.save(importer);
  await athletes.save(sharer);

  service = new PlanImportService(plans, workouts, exercises, athletes, new InMemoryUnitOfWork(), deps('imported'));
});

describe('previewing a share link', () => {
  it('answers with nothing for a token nobody minted', async () => {
    expect(await service.preview(importer, 'not-a-token')).toBeNull();
  });

  it('answers with nothing once the link is revoked', async () => {
    const token = await seedSharedPlan();
    const shared = (await plans.findByShareToken(token))!;
    shared.unshare(NOW);
    await plans.save(shared);

    expect(await service.preview(importer, token)).toBeNull();
  });

  it('describes the cycle and names who shared it', async () => {
    const token = await seedSharedPlan();

    const preview = (await service.preview(importer, token))!;

    expect(preview.name).toBe('Dana PPL');
    expect(preview.sharedBy).toBe('Dana');
    expect(preview.anchorDate).toBe('2026-09-01');
    expect(preview.slots.map((slot) => slot.workoutName)).toEqual(['Push Day', null]);
    expect(preview.slots.map((slot) => slot.isRestDay)).toEqual([false, true]);
  });

  it('counts what the import would add before anything is written', async () => {
    const token = await seedSharedPlan();

    const preview = (await service.preview(importer, token))!;

    expect(preview.newWorkouts).toBe(1);
    expect(preview.newExercises).toBe(1);
    // A preview reads; it must not leave the copies it costed behind.
    expect(await workouts.listFor(importer.id, true)).toHaveLength(0);
    expect(await exercises.listFor(importer.id, true)).toHaveLength(0);
  });

  it('points an athlete at their own plan when it is their own link', async () => {
    const plan = Plan.create(importer.id, 'Mine', DateOnly.parse('2026-09-01'), deps('mine'));
    const token = plan.share(deps('mine-share'));
    await plans.save(plan);

    expect((await service.preview(importer, token))?.ownPlanId).toBe(plan.id);
  });
});

describe('importing a shared plan', () => {
  it("copies the plan into the importing athlete's account", async () => {
    const token = await seedSharedPlan();

    const outcome = await service.import(importer, token, IMPORT_DATE);

    expect(outcome.ok).toBe(true);
    const imported = (await plans.findVisible(importer.id, outcome.ok ? outcome.value.planId : ''))!;
    expect(imported.name).toBe('Dana PPL');
    expect(imported.ownership.isOwnedBy(importer.id)).toBe(true);
    expect(imported.cycleLength).toBe(2);
    expect(imported.isActive).toBe(false);
    expect(imported.shareToken).toBeNull();
  });

  it('anchors the copy to the date the importer chose', async () => {
    const token = await seedSharedPlan();

    const outcome = await service.import(importer, token, IMPORT_DATE);
    const imported = (await plans.findVisible(importer.id, outcome.ok ? outcome.value.planId : ''))!;

    expect(imported.anchorDate.value).toBe('2026-10-01');
  });

  it('copies the workouts and exercises the plan needs, with their targets', async () => {
    const token = await seedSharedPlan();

    await service.import(importer, token, IMPORT_DATE);

    const [workout] = await workouts.listFor(importer.id, false);
    expect(workout?.name).toBe('Push Day');

    const [exercise] = await exercises.listFor(importer.id, false);
    expect(exercise?.name).toBe('Bench Press');
    expect(exercise?.equipmentIds).toEqual(['barbell']);

    // The entry has to point at the importer's own copy, not at Dana's row.
    expect(workout?.exercises[0]!.exerciseId).toBe(exercise!.id);
    expect(workout?.exercises[0]!.target.toSnapshot().targetWeight).toBe('135.00');
  });

  it('points the imported slots at the imported workouts, keeping rest days', async () => {
    const token = await seedSharedPlan();

    const outcome = await service.import(importer, token, IMPORT_DATE);
    const imported = (await plans.findVisible(importer.id, outcome.ok ? outcome.value.planId : ''))!;
    const [workout] = await workouts.listFor(importer.id, false);

    expect(imported.slots.map((slot) => slot.workoutId)).toEqual([workout!.id, null]);
  });

  it("leaves the sharer's own rows alone", async () => {
    const token = await seedSharedPlan();

    await service.import(importer, token, IMPORT_DATE);

    expect(await plans.listFor(sharer.id, false)).toHaveLength(1);
    expect(await workouts.listFor(sharer.id, false)).toHaveLength(1);
    expect(await exercises.listFor(sharer.id, false)).toHaveLength(1);
  });

  it('answers not-found for a token nobody minted, writing nothing', async () => {
    const outcome = await service.import(importer, 'not-a-token', IMPORT_DATE);

    expect(outcome).toEqual({ ok: false, error: 'not-found' });
    expect(await plans.listFor(importer.id, false)).toHaveLength(0);
  });
});

describe('what an import reuses instead of copying', () => {
  /**
   * The unique index on (user_id, name) means the importer cannot hold two
   * exercises under one name, so a same-named one has to be treated as the
   * same movement - copying would be a constraint violation, not a duplicate.
   */
  it('reuses an exercise the athlete already has under the same name', async () => {
    const token = await seedSharedPlan();
    const mine = Exercise.create(
      importer.id,
      { name: 'Bench Press', exerciseType: 'strength', muscleGroup: 'chest', description: null },
      deps('mine-exercise'),
    );
    await exercises.save(mine);

    expect((await service.preview(importer, token))?.newExercises).toBe(0);

    await service.import(importer, token, IMPORT_DATE);

    const mineNow = await exercises.listFor(importer.id, false);
    expect(mineNow).toHaveLength(1);
    const [workout] = await workouts.listFor(importer.id, false);
    expect(workout?.exercises[0]!.exerciseId).toBe(mine.id);
  });

  it('reuses a sample exercise rather than copying shared library data', async () => {
    const sample = Exercise.fromSnapshot({
      id: 'sample-bench',
      userId: null,
      forkedFromId: null,
      name: 'Bench Press',
      exerciseType: 'strength',
      muscleGroup: 'chest',
      description: null,
      createdAt: NOW,
      equipmentIds: [],
    });
    await exercises.save(sample);

    const workout = Workout.create(sharer.id, 'Push Day', deps('their-workout'));
    workout.addExercise(sample.id, SetTarget.none(), deps('their-entry'));
    await workouts.save(workout);

    const plan = Plan.create(sharer.id, 'Dana PPL', DateOnly.parse('2026-09-01'), deps('their-plan'));
    plan.addSlot(workout.id, deps('their-slot'));
    const token = plan.share(deps('their-share'));
    await plans.save(plan);

    expect((await service.preview(importer, token))?.newExercises).toBe(0);

    await service.import(importer, token, IMPORT_DATE);

    expect(await exercises.listFor(importer.id, false)).toHaveLength(0);
    const [imported] = await workouts.listFor(importer.id, false);
    expect(imported?.exercises[0]!.exerciseId).toBe('sample-bench');
  });

  /**
   * The importer's fork stands in for the sample in their library, so
   * pointing at the sample would name a row their own list hides.
   */
  it("prefers the athlete's own fork of a sample over the sample itself", async () => {
    const sample = Exercise.fromSnapshot({
      id: 'sample-bench',
      userId: null,
      forkedFromId: null,
      name: 'Bench Press',
      exerciseType: 'strength',
      muscleGroup: 'chest',
      description: null,
      createdAt: NOW,
      equipmentIds: [],
    });
    await exercises.save(sample);
    const myFork = sample.editableCopyFor(importer.id, deps('my-fork')).editable;
    myFork.updateDetails({ name: 'Bench Press (mine)', exerciseType: 'strength', muscleGroup: 'chest', description: null });
    await exercises.save(myFork);

    // Dana shares a plan built on her own fork of the same sample.
    const token = await seedSharedPlan({ exerciseForkedFrom: sample.id });

    expect((await service.preview(importer, token))?.newExercises).toBe(0);

    await service.import(importer, token, IMPORT_DATE);

    const [workout] = await workouts.listFor(importer.id, false);
    expect(workout?.exercises[0]!.exerciseId).toBe(myFork.id);
  });

  /**
   * Kept for exercises alone: it can only name a sample, and a per-athlete
   * unique name means there is never a second copy to make `findForkOf`
   * ambiguous. Without it the copy and the sample would list side by side
   * under one name.
   */
  it('keeps a copied exercise pointing back at the sample it descends from', async () => {
    const token = await seedSharedPlan({ exerciseForkedFrom: 'sample-bench' });

    await service.import(importer, token, IMPORT_DATE);

    const [copied] = await exercises.listFor(importer.id, false);
    expect(copied?.forkedFromId).toBe('sample-bench');
    expect(copied?.canRevert).toBe(true);
  });

  it('reuses a workout the athlete already forked from the same sample', async () => {
    const sampleWorkout = Workout.fromSnapshot({
      id: 'sample-push',
      userId: null,
      forkedFromId: null,
      name: 'Sample Push',
      createdAt: NOW,
      updatedAt: NOW,
      exercises: [],
    });
    await workouts.save(sampleWorkout);
    const myFork = sampleWorkout.editableCopyFor(importer.id, deps('my-workout-fork')).editable;
    await workouts.save(myFork);

    const theirFork = sampleWorkout.editableCopyFor(sharer.id, deps('their-workout-fork')).editable;
    await workouts.save(theirFork);

    const plan = Plan.create(sharer.id, 'Dana PPL', DateOnly.parse('2026-09-01'), deps('their-plan'));
    plan.addSlot(theirFork.id, deps('their-slot'));
    const token = plan.share(deps('their-share'));
    await plans.save(plan);

    expect((await service.preview(importer, token))?.newWorkouts).toBe(0);

    const outcome = await service.import(importer, token, IMPORT_DATE);
    const imported = (await plans.findVisible(importer.id, outcome.ok ? outcome.value.planId : ''))!;

    expect(imported.slots[0]!.workoutId).toBe(myFork.id);
  });

  /**
   * The deliberate exception. A workout with a familiar name can hold quite
   * different exercises, so it is copied rather than matched by name - which
   * is why a second import of the same link leaves a second workout behind,
   * and why the confirmation page says so before writing anything.
   */
  it('copies a workout even when the athlete has one of the same name', async () => {
    const token = await seedSharedPlan();
    await workouts.save(Workout.create(importer.id, 'Push Day', deps('my-workout')));

    expect((await service.preview(importer, token))?.newWorkouts).toBe(1);

    await service.import(importer, token, IMPORT_DATE);

    expect(await workouts.listFor(importer.id, false)).toHaveLength(2);
  });

  it('adds only the plan on a second import of the same link', async () => {
    const token = await seedSharedPlan();

    await service.import(importer, token, IMPORT_DATE);
    const afterFirst = (await exercises.listFor(importer.id, false)).length;

    await service.import(importer, token, IMPORT_DATE);

    // The exercise is matched by name, so the second import reuses it; the
    // workout is not, so it is copied again.
    expect(await exercises.listFor(importer.id, false)).toHaveLength(afterFirst);
    expect(await workouts.listFor(importer.id, false)).toHaveLength(2);
    expect(await plans.listFor(importer.id, false)).toHaveLength(2);
  });
});
