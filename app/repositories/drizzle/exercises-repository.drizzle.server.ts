import {
  and,
  asc,
  eq,
  inArray,
  isNotNull,
  isNull,
  notInArray,
  or,
  type SQL,
} from "drizzle-orm";

import { db, dbScope } from "~/db/index.server";
import {
  exerciseEquipment,
  exercises,
  type Exercise as ExerciseRow,
} from "~/db/schema";
import { Exercise } from "~/domain/exercise/exercise";

import type {
  DeleteExerciseOutcome,
  ExercisesRepository,
} from "../exercises-repository.server";

/**
 * Own rows, plus - when the athlete wants them - the samples they have not
 * forked. A forked sample is excluded so the same logical exercise doesn't
 * appear twice, once as the shared original and once as the personal copy.
 */
export function sampleOrOwnExercisesWhere(
  userId: string,
  showSampleData: boolean,
): SQL {
  const ownCondition = eq(exercises.userId, userId);
  if (!showSampleData) return ownCondition;
  const forkedSampleIds = db
    .select({ id: exercises.forkedFromId })
    .from(exercises)
    .where(
      and(eq(exercises.userId, userId), isNotNull(exercises.forkedFromId)),
    );
  return or(
    ownCondition,
    and(isNull(exercises.userId), notInArray(exercises.id, forkedSampleIds)),
  )!;
}

function visibleToUserWhere(userId: string, exerciseId: string): SQL {
  return and(
    eq(exercises.id, exerciseId),
    or(eq(exercises.userId, userId), isNull(exercises.userId)),
  )!;
}

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
  async listFor(
    userId: string,
    showSampleData: boolean,
  ): Promise<Exercise[]> {
    const rows = await dbScope.query.exercises.findMany({
      where: sampleOrOwnExercisesWhere(userId, showSampleData),
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

  async findVisible(
    userId: string,
    exerciseId: string,
  ): Promise<Exercise | null> {
    const row = await dbScope.query.exercises.findFirst({
      where: visibleToUserWhere(userId, exerciseId),
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

  async findForkOf(
    userId: string,
    sampleId: string,
  ): Promise<Exercise | null> {
    const row = await dbScope.query.exercises.findFirst({
      where: and(
        eq(exercises.userId, userId),
        eq(exercises.forkedFromId, sampleId),
      ),
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
    await dbScope
      .delete(exerciseEquipment)
      .where(eq(exerciseEquipment.exerciseId, snapshot.id));

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
   * `on delete restrict` on the template and logged-set FKs means a movement
   * still referenced by history refuses to go. That rejection is the answer,
   * not an error to propagate - reverting a customisation that is still in
   * use should tell the athlete why.
   */
  async delete(exerciseId: string): Promise<DeleteExerciseOutcome> {
    try {
      await dbScope.delete(exercises).where(eq(exercises.id, exerciseId));
      return "deleted";
    } catch {
      return "in-use";
    }
  }
}
