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

import { db } from "~/db/index.server";
import {
  equipment,
  exerciseEquipment,
  exercises,
  routineSlots,
  routines,
  templateExercises,
  templates,
} from "~/db/schema";

/**
 * Rows with a null userId are sample/system data, seeded once and shared by
 * every account. A user can "fork" one into a personal row (userId set,
 * forkedFromId pointing back at the sample) by editing it - see the
 * fork*ForUser helpers below. Once forked, the sample original is excluded
 * from that user's own view so the same logical item doesn't show twice.
 */
type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

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

export function sampleOrOwnEquipmentWhere(
  userId: string,
  showSampleData: boolean,
): SQL {
  const ownCondition = eq(equipment.userId, userId);
  if (!showSampleData) return ownCondition;
  return or(ownCondition, isNull(equipment.userId))!;
}

export function sampleOrOwnTemplatesWhere(
  userId: string,
  showSampleData: boolean,
): SQL {
  const ownCondition = eq(templates.userId, userId);
  if (!showSampleData) return ownCondition;
  const forkedSampleIds = db
    .select({ id: templates.forkedFromId })
    .from(templates)
    .where(
      and(eq(templates.userId, userId), isNotNull(templates.forkedFromId)),
    );
  return or(
    ownCondition,
    and(isNull(templates.userId), notInArray(templates.id, forkedSampleIds)),
  )!;
}

export function sampleOrOwnRoutinesWhere(
  userId: string,
  showSampleData: boolean,
): SQL {
  const ownCondition = eq(routines.userId, userId);
  if (!showSampleData) return ownCondition;
  const forkedSampleIds = db
    .select({ id: routines.forkedFromId })
    .from(routines)
    .where(
      and(eq(routines.userId, userId), isNotNull(routines.forkedFromId)),
    );
  return or(
    ownCondition,
    and(isNull(routines.userId), notInArray(routines.id, forkedSampleIds)),
  )!;
}

type SampleExercise = typeof exercises.$inferSelect;

export async function forkExerciseForUser(
  tx: Transaction,
  sample: SampleExercise,
  userId: string,
) {
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

type SampleTemplate = typeof templates.$inferSelect & {
  templateExercises: (typeof templateExercises.$inferSelect)[];
};

export async function forkTemplateForUser(
  tx: Transaction,
  sample: SampleTemplate,
  userId: string,
) {
  const existingFork = await tx.query.templates.findFirst({
    where: and(
      eq(templates.userId, userId),
      eq(templates.forkedFromId, sample.id),
    ),
    with: {
      templateExercises: { orderBy: asc(templateExercises.position) },
    },
  });
  if (existingFork) {
    return {
      fork: existingFork,
      forkedTemplateExercises: existingFork.templateExercises,
    };
  }

  const [fork] = await tx
    .insert(templates)
    .values({ userId, forkedFromId: sample.id, name: sample.name })
    .returning();

  const sorted = [...sample.templateExercises].sort(
    (a, b) => a.position - b.position,
  );
  const forkedTemplateExercises =
    sorted.length > 0
      ? await tx
          .insert(templateExercises)
          .values(
            sorted.map((te) => ({
              templateId: fork.id,
              exerciseId: te.exerciseId,
              position: te.position,
              targetSets: te.targetSets,
              targetReps: te.targetReps,
              targetWeight: te.targetWeight,
              targetDurationSeconds: te.targetDurationSeconds,
              targetSpeed: te.targetSpeed,
              targetResistance: te.targetResistance,
            })),
          )
          .returning()
      : [];

  return { fork, forkedTemplateExercises };
}

type SampleRoutine = typeof routines.$inferSelect & {
  slots: (typeof routineSlots.$inferSelect)[];
};

export async function forkRoutineForUser(
  tx: Transaction,
  sample: SampleRoutine,
  userId: string,
) {
  const existingFork = await tx.query.routines.findFirst({
    where: and(
      eq(routines.userId, userId),
      eq(routines.forkedFromId, sample.id),
    ),
    with: {
      slots: { orderBy: asc(routineSlots.position) },
    },
  });
  if (existingFork) {
    return { fork: existingFork, forkedSlots: existingFork.slots };
  }

  const [fork] = await tx
    .insert(routines)
    .values({
      userId,
      forkedFromId: sample.id,
      name: sample.name,
      anchorDate: sample.anchorDate,
    })
    .returning();

  const sorted = [...sample.slots].sort((a, b) => a.position - b.position);
  const forkedSlots =
    sorted.length > 0
      ? await tx
          .insert(routineSlots)
          .values(
            sorted.map((slot) => ({
              routineId: fork.id,
              position: slot.position,
              templateId: slot.templateId,
            })),
          )
          .returning()
      : [];

  return { fork, forkedSlots };
}
