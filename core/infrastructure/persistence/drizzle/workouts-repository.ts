import { and, asc, desc, eq, inArray } from 'drizzle-orm';
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
import { visibleRowWhere, visibleRowsWhere } from '~infrastructure/persistence/drizzle/shared/visibility';
import { type OrderedChildColumns, saveOrderedChildren } from '~infrastructure/persistence/shared/save-ordered-children';

/**
 * The columns `shared/visibility.ts` reads to build this table's clauses.
 */
const visibility = {
  table: workouts,
  id: workouts.id,
  userId: workouts.userId,
  forkedFromId: workouts.forkedFromId,
};

/**
 * The columns `shared/save-ordered-children.ts` needs for `workout_exercises`.
 */
const exerciseColumns: OrderedChildColumns = {
  table: workoutExercises,
  id: workoutExercises.id,
  parentId: workoutExercises.workoutId,
  parentIdKey: 'workoutId',
  position: workoutExercises.position,
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

function toRow(entry: WorkoutExerciseSnapshot) {
  return {
    exerciseId: entry.exerciseId,
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

  /**
   * Two columns, no child join - see the port for why this exists.
   */
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
    if (workoutIds.length === 0) {
      return [];
    }

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

  async findForksOf(userId: string, sampleIds: readonly string[]): Promise<Workout[]> {
    if (sampleIds.length === 0) {
      return [];
    }

    const rows = await dbScope.query.workouts.findMany({
      where: and(eq(workouts.userId, userId), inArray(workouts.forkedFromId, [...sampleIds])),
      with: {
        workoutExercises: { orderBy: asc(workoutExercises.position) },
      },
    });
    return rows.map(toWorkout);
  }

  /**
   * Writes the workout and its exercise entries as one unit - see
   * `shared/save-ordered-children.ts` for the entry-ordering sequence.
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

    await saveOrderedChildren(exerciseColumns, snapshot.id, snapshot.exercises, toRow);
  }

  async delete(workoutId: string): Promise<void> {
    await dbScope.delete(workouts).where(eq(workouts.id, workoutId));
  }
}
