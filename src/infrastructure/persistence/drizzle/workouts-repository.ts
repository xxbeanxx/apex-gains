import { type SQL, and, asc, desc, eq, inArray } from 'drizzle-orm';

import type { WorkoutName, WorkoutsRepository } from '~application/ports/persistence/workouts-repository';
import { LibraryVisibility } from '~domain/shared/ownership';
import { Workout, type WorkoutExerciseSnapshot } from '~domain/workout/workout';
import { dbScope } from '~infrastructure/persistence/drizzle/index';
import {
  type WorkoutExercise as WorkoutExerciseRow,
  type Workout as WorkoutRow,
  workoutExercises,
  workouts,
} from '~infrastructure/persistence/drizzle/schema';

import { diffChildren } from '../shared/diff-children';
import { writePositions } from '../shared/write-positions';
import { visibleRowWhere, visibleRowsWhere } from './shared/visibility';

/** The columns `shared/visibility.ts` reads to build this table's clauses. */
const visibility = {
  table: workouts,
  id: workouts.id,
  userId: workouts.userId,
  forkedFromId: workouts.forkedFromId,
};

type RowWithExercises = WorkoutRow & {
  workoutExercises: WorkoutExerciseRow[];
};

function toWorkout(row: RowWithExercises): Workout {
  return Workout.fromSnapshot({
    id: row.id,
    userId: row.userId,
    forkedFromId: row.forkedFromId,
    name: row.name,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    exercises: row.workoutExercises.map((entry) => ({
      id: entry.id,
      exerciseId: entry.exerciseId,
      position: entry.position,
      targetSets: entry.targetSets,
      targetReps: entry.targetReps,
      targetWeight: entry.targetWeight,
      targetDurationSeconds: entry.targetDurationSeconds,
      targetSpeed: entry.targetSpeed,
      targetResistance: entry.targetResistance,
      targetRestSeconds: entry.targetRestSeconds,
    })),
  });
}

function toRow(workoutId: string, entry: WorkoutExerciseSnapshot) {
  return {
    id: entry.id,
    workoutId,
    exerciseId: entry.exerciseId,
    position: entry.position,
    targetSets: entry.targetSets,
    targetReps: entry.targetReps,
    targetWeight: entry.targetWeight,
    targetDurationSeconds: entry.targetDurationSeconds,
    targetSpeed: entry.targetSpeed,
    targetResistance: entry.targetResistance,
    targetRestSeconds: entry.targetRestSeconds,
  };
}

export class DrizzleWorkoutsRepository implements WorkoutsRepository {
  async listFor(userId: string, showSampleData: boolean): Promise<Workout[]> {
    const rows = await dbScope.query.workouts.findMany({
      where: visibleRowsWhere(visibility, LibraryVisibility.for(userId, showSampleData)),
      orderBy: desc(workouts.updatedAt),
      with: {
        workoutExercises: { orderBy: asc(workoutExercises.position) },
      },
    });
    return rows.map(toWorkout);
  }

  /** Two columns, no child join - see the port for why this exists. */
  async listNamesFor(userId: string, showSampleData: boolean): Promise<WorkoutName[]> {
    return dbScope
      .select({ id: workouts.id, name: workouts.name })
      .from(workouts)
      .where(visibleRowsWhere(visibility, LibraryVisibility.for(userId, showSampleData)))
      .orderBy(desc(workouts.updatedAt));
  }

  async findVisible(userId: string, workoutId: string): Promise<Workout | null> {
    const row = await dbScope.query.workouts.findFirst({
      where: visibleRowWhere(visibility, userId, workoutId),
      with: {
        workoutExercises: { orderBy: asc(workoutExercises.position) },
      },
    });
    return row ? toWorkout(row) : null;
  }

  async findManyByIds(workoutIds: readonly string[]): Promise<Workout[]> {
    if (workoutIds.length === 0) return [];

    const rows = await dbScope.query.workouts.findMany({
      where: inArray(workouts.id, [...workoutIds]),
      with: { workoutExercises: { orderBy: asc(workoutExercises.position) } },
    });
    return rows.map(toWorkout);
  }

  async findForkOf(userId: string, sampleId: string): Promise<Workout | null> {
    const row = await dbScope.query.workouts.findFirst({
      where: and(eq(workouts.userId, userId), eq(workouts.forkedFromId, sampleId)),
      with: {
        workoutExercises: { orderBy: asc(workoutExercises.position) },
      },
    });
    return row ? toWorkout(row) : null;
  }

  /**
   * Writes the workout and its exercise entries as one unit.
   *
   * The order matters, and it is the reason this reads as more than an
   * upsert: removals free their positions first, then everything that moved
   * is repositioned through negative scratch values (see
   * shared/write-positions.ts), and only then are new entries inserted at
   * their final positions. Any other order can transiently violate the
   * `(workoutId, position)` unique constraint.
   *
   * Callers run this inside a UnitOfWork, so the intermediate states are
   * never visible to anyone else.
   */
  async save(workout: Workout): Promise<void> {
    const snapshot = workout.toSnapshot();

    await dbScope
      .insert(workouts)
      .values({
        id: snapshot.id,
        userId: snapshot.userId,
        forkedFromId: snapshot.forkedFromId,
        name: snapshot.name,
        createdAt: snapshot.createdAt,
        updatedAt: snapshot.updatedAt,
      })
      .onConflictDoUpdate({
        target: workouts.id,
        set: { name: snapshot.name, updatedAt: snapshot.updatedAt },
      });

    const existing = await dbScope.select().from(workoutExercises).where(eq(workoutExercises.workoutId, snapshot.id));

    const diff = diffChildren(existing, snapshot.exercises);

    if (diff.deletedIds.length > 0) {
      await dbScope.delete(workoutExercises).where(inArray(workoutExercises.id, diff.deletedIds));
    }

    for (const entry of diff.updated) {
      const row = toRow(snapshot.id, entry);
      await dbScope
        .update(workoutExercises)
        .set({
          exerciseId: row.exerciseId,
          targetSets: row.targetSets,
          targetReps: row.targetReps,
          targetWeight: row.targetWeight,
          targetDurationSeconds: row.targetDurationSeconds,
          targetSpeed: row.targetSpeed,
          targetResistance: row.targetResistance,
          targetRestSeconds: row.targetRestSeconds,
        })
        .where(eq(workoutExercises.id, row.id));
    }

    await writePositions(new Map(existing.map((row) => [row.id, row.position])), diff.updated, (id, position) =>
      dbScope.update(workoutExercises).set({ position }).where(eq(workoutExercises.id, id)),
    );

    if (diff.inserted.length > 0) {
      await dbScope.insert(workoutExercises).values(diff.inserted.map((entry) => toRow(snapshot.id, entry)));
    }
  }

  async delete(workoutId: string): Promise<void> {
    await dbScope.delete(workouts).where(eq(workouts.id, workoutId));
  }
}
