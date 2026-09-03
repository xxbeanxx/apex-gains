import {
  and,
  asc,
  eq,
  isNotNull,
  isNull,
  notInArray,
  or,
  type SQL,
} from "drizzle-orm";

import { db, type Transaction } from "~/db/index.server";
import { exerciseEquipment, exercises, type Exercise } from "~/db/schema";

import type {
  CreateExerciseResult,
  ExerciseDetails,
  ExercisesRepository,
  ExerciseWithEquipment,
  RevertExerciseResult,
  UpdateExerciseResult,
} from "./exercises-repository";

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

// A sample (userId null) exercise a user edits gets copied into a real,
// per-user row - see CLAUDE.md's "Sample data and fork-on-write". Must run
// inside the same transaction as whatever mutation triggered the fork.
async function forkExerciseForUser(
  tx: Transaction,
  sample: Exercise,
  userId: string,
): Promise<Exercise> {
  const existingFork = await tx.query.exercises.findFirst({
    where: and(
      eq(exercises.userId, userId),
      eq(exercises.forkedFromId, sample.id),
    ),
  });
  if (existingFork) return existingFork;

  const [fork] = await tx
    .insert(exercises)
    .values({
      userId,
      forkedFromId: sample.id,
      name: sample.name,
      exerciseType: sample.exerciseType,
      muscleGroup: sample.muscleGroup,
      description: sample.description,
    })
    .returning();

  const links = await tx.query.exerciseEquipment.findMany({
    where: eq(exerciseEquipment.exerciseId, sample.id),
  });
  if (links.length > 0) {
    await tx.insert(exerciseEquipment).values(
      links.map((link) => ({
        exerciseId: fork.id,
        equipmentId: link.equipmentId,
      })),
    );
  }

  return fork;
}

export class DrizzleExercisesRepository implements ExercisesRepository {
  async listWithEquipmentForUser(
    userId: string,
    showSampleData: boolean,
  ): Promise<ExerciseWithEquipment[]> {
    return db.query.exercises.findMany({
      where: sampleOrOwnExercisesWhere(userId, showSampleData),
      orderBy: asc(exercises.name),
      with: { equipmentLinks: { with: { equipment: true } } },
    });
  }

  async findById(exerciseId: string) {
    const [row] = await db
      .select()
      .from(exercises)
      .where(eq(exercises.id, exerciseId))
      .limit(1);
    return row ?? null;
  }

  async create(
    userId: string,
    input: ExerciseDetails,
  ): Promise<CreateExerciseResult> {
    const existing = await db.query.exercises.findFirst({
      where: and(eq(exercises.userId, userId), eq(exercises.name, input.name)),
    });
    if (existing) return { outcome: "duplicate-name" };

    const [exercise] = await db
      .insert(exercises)
      .values({
        userId,
        name: input.name,
        exerciseType: input.exerciseType,
        muscleGroup: input.muscleGroup ?? null,
        description: input.description ?? null,
      })
      .returning();
    return { outcome: "created", exercise };
  }

  async update(
    userId: string,
    exerciseId: string,
    input: ExerciseDetails,
  ): Promise<UpdateExerciseResult> {
    return db.transaction(async (tx) => {
      const exercise = await tx.query.exercises.findFirst({
        where: eq(exercises.id, exerciseId),
      });
      if (!exercise) return { outcome: "not-found" as const };

      const target =
        exercise.userId === null
          ? await forkExerciseForUser(tx, exercise, userId)
          : exercise;

      const existing = await tx.query.exercises.findFirst({
        where: and(
          eq(exercises.userId, userId),
          eq(exercises.name, input.name),
        ),
      });
      if (existing && existing.id !== target.id) {
        return { outcome: "duplicate-name" as const };
      }

      await tx
        .update(exercises)
        .set({
          name: input.name,
          exerciseType: input.exerciseType,
          muscleGroup: input.muscleGroup ?? null,
          description: input.description ?? null,
        })
        .where(eq(exercises.id, target.id));
      return { outcome: "updated" as const };
    });
  }

  async toggleEquipment(
    userId: string,
    exerciseId: string,
    equipmentId: string,
    checked: boolean,
  ): Promise<void> {
    await db.transaction(async (tx) => {
      const exercise = await tx.query.exercises.findFirst({
        where: eq(exercises.id, exerciseId),
      });
      if (!exercise) return;

      const targetExerciseId =
        exercise.userId === null
          ? (await forkExerciseForUser(tx, exercise, userId)).id
          : exercise.id;

      if (checked) {
        await tx
          .insert(exerciseEquipment)
          .values({ exerciseId: targetExerciseId, equipmentId })
          .onConflictDoNothing();
      } else {
        await tx
          .delete(exerciseEquipment)
          .where(
            and(
              eq(exerciseEquipment.exerciseId, targetExerciseId),
              eq(exerciseEquipment.equipmentId, equipmentId),
            ),
          );
      }
    });
  }

  async revert(
    userId: string,
    exerciseId: string,
  ): Promise<RevertExerciseResult> {
    const exercise = await db.query.exercises.findFirst({
      where: and(eq(exercises.id, exerciseId), eq(exercises.userId, userId)),
    });
    if (!exercise || !exercise.forkedFromId) {
      return { outcome: "nothing-to-revert" };
    }
    try {
      await db.delete(exercises).where(eq(exercises.id, exercise.id));
    } catch {
      return { outcome: "in-use" };
    }
    return { outcome: "reverted" };
  }
}
