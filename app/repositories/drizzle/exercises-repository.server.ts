import { and, asc, eq, inArray, type SQL } from 'drizzle-orm';

import { dbScope } from '~/db/index.server';
import { exerciseEquipment, exercises, type Exercise as ExerciseRow } from '~/db/schema';
import { Exercise } from '~/domain/exercise/exercise';
import { LibraryVisibility } from '~/domain/shared/ownership';

import type { DeleteExerciseOutcome, ExercisesRepository } from '../exercises-repository.server';
import { visibleRowsWhere, visibleRowWhere } from './shared/visibility';

/** Postgres' SQLSTATE for `foreign_key_violation`. */
const FOREIGN_KEY_VIOLATION = '23503';

/**
 * Drizzle wraps a driver failure in a `DrizzleQueryError` carrying the query
 * text, so postgres-js's `code` is on the `cause`, not on what was thrown.
 * The chain is walked rather than unwrapped once, since nothing guarantees
 * how deep the wrapping goes.
 */
function isForeignKeyViolation(error: unknown): boolean {
  for (let current = error; current instanceof Error || (typeof current === 'object' && current !== null);) {
    if ('code' in current && current.code === FOREIGN_KEY_VIOLATION) return true;
    if (!('cause' in current) || current.cause === current) return false;
    current = current.cause;
  }
  return false;
}

/** The columns `shared/visibility.ts` reads to build this table's clauses. */
const visibility = {
  table: exercises,
  id: exercises.id,
  userId: exercises.userId,
  forkedFromId: exercises.forkedFromId,
};

type RowWithLinks = ExerciseRow & {
  equipmentLinks: { equipmentId: string }[];
};

function toExercise(row: RowWithLinks): Exercise {
  return Exercise.fromSnapshot({
    id: row.id,
    userId: row.userId,
    forkedFromId: row.forkedFromId,
    name: row.name,
    exerciseType: row.exerciseType,
    muscleGroup: row.muscleGroup,
    description: row.description,
    createdAt: row.createdAt,
    equipmentIds: row.equipmentLinks.map((link) => link.equipmentId),
  });
}

export class DrizzleExercisesRepository implements ExercisesRepository {
  async listFor(userId: string, showSampleData: boolean): Promise<Exercise[]> {
    const rows = await dbScope.query.exercises.findMany({
      where: visibleRowsWhere(visibility, LibraryVisibility.for(userId, showSampleData)),
      orderBy: asc(exercises.name),
      with: { equipmentLinks: true },
    });
    return rows.map(toExercise);
  }

  async findById(exerciseId: string): Promise<Exercise | null> {
    const row = await dbScope.query.exercises.findFirst({
      where: eq(exercises.id, exerciseId),
      with: { equipmentLinks: true },
    });
    return row ? toExercise(row) : null;
  }

  async findManyByIds(exerciseIds: readonly string[]): Promise<Exercise[]> {
    if (exerciseIds.length === 0) return [];
    const rows = await dbScope.query.exercises.findMany({
      where: inArray(exercises.id, [...exerciseIds]),
      with: { equipmentLinks: true },
    });
    return rows.map(toExercise);
  }

  async findVisible(userId: string, exerciseId: string): Promise<Exercise | null> {
    const row = await dbScope.query.exercises.findFirst({
      where: visibleRowWhere(visibility, userId, exerciseId),
      with: { equipmentLinks: true },
    });
    return row ? toExercise(row) : null;
  }

  async findOwnByName(userId: string, name: string): Promise<Exercise | null> {
    const row = await dbScope.query.exercises.findFirst({
      where: and(eq(exercises.userId, userId), eq(exercises.name, name)),
      with: { equipmentLinks: true },
    });
    return row ? toExercise(row) : null;
  }

  async findForkOf(userId: string, sampleId: string): Promise<Exercise | null> {
    const row = await dbScope.query.exercises.findFirst({
      where: and(eq(exercises.userId, userId), eq(exercises.forkedFromId, sampleId)),
      with: { equipmentLinks: true },
    });
    return row ? toExercise(row) : null;
  }

  async save(exercise: Exercise): Promise<void> {
    const snapshot = exercise.toSnapshot();

    await dbScope
      .insert(exercises)
      .values({
        id: snapshot.id,
        userId: snapshot.userId,
        forkedFromId: snapshot.forkedFromId,
        name: snapshot.name,
        exerciseType: snapshot.exerciseType,
        muscleGroup: snapshot.muscleGroup,
        description: snapshot.description,
        createdAt: snapshot.createdAt,
      })
      .onConflictDoUpdate({
        target: exercises.id,
        set: {
          name: snapshot.name,
          exerciseType: snapshot.exerciseType,
          muscleGroup: snapshot.muscleGroup,
          description: snapshot.description,
        },
      });

    // Equipment links are an unordered set with no identity of their own, so
    // they are replaced wholesale rather than diffed - there is nothing a
    // caller could be holding a reference to. Always inside the caller's
    // transaction, so the exercise is never briefly unlinked.
    await dbScope.delete(exerciseEquipment).where(eq(exerciseEquipment.exerciseId, snapshot.id));

    if (snapshot.equipmentIds.length > 0) {
      await dbScope.insert(exerciseEquipment).values(
        snapshot.equipmentIds.map((equipmentId) => ({
          exerciseId: snapshot.id,
          equipmentId,
        })),
      );
    }
  }

  /**
   * `on delete restrict` on the workout and logged-set FKs means a movement
   * still referenced by history refuses to go. That rejection is the answer,
   * not an error to propagate - reverting a customisation that is still in
   * use should tell the athlete why.
   */
  async delete(exerciseId: string): Promise<DeleteExerciseOutcome> {
    try {
      await dbScope.delete(exercises).where(eq(exercises.id, exerciseId));
      return 'deleted';
    } catch (error) {
      // Only a foreign-key violation means "a workout or a logged set still
      // points at this". Anything else - a dropped connection, a deadlock -
      // is a failure, and reporting it as `in-use` would tell the athlete
      // their exercise is referenced by something that does not exist.
      if (isForeignKeyViolation(error)) return 'in-use';
      throw error;
    }
  }
}
