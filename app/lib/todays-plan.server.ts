import { and, asc, eq } from "drizzle-orm";
import type { Logger } from "pino";

import { db } from "~/db/index.server";
import {
  type Exercise,
  exercises,
  routineSlots,
  routines,
  templateExercises,
  templates,
  workoutSessions,
} from "~/db/schema";

import { slotIndexForDate, todayDateString } from "./cycle";
import { logger as baseLogger } from "./logger.server";

export type TodaysPlanItem = {
  exercise: Exercise;
  targetSets: number | null;
  targetReps: number | null;
  targetWeight: string | null;
  targetDurationSeconds: number | null;
  targetSpeed: string | null;
  targetResistance: number | null;
};

export type TodaysPlan =
  | { type: "none" }
  | { type: "rest"; routineId: string }
  | {
      type: "template";
      routineId: string;
      templateId: string;
      templateName: string;
      items: TodaysPlanItem[];
    };

export async function getTodaysPlan(
  userId: string,
  dateStr: string = todayDateString(),
): Promise<TodaysPlan> {
  const [activeRoutine] = await db
    .select()
    .from(routines)
    .where(and(eq(routines.userId, userId), eq(routines.isActive, true)))
    .limit(1);
  if (!activeRoutine) return { type: "none" };

  const slots = await db
    .select()
    .from(routineSlots)
    .where(eq(routineSlots.routineId, activeRoutine.id))
    .orderBy(asc(routineSlots.position));
  if (slots.length === 0) return { type: "none" };

  const slotIndex = slotIndexForDate(
    activeRoutine.anchorDate,
    slots.length,
    dateStr,
  );
  const todaysSlot = slots[slotIndex];

  if (!todaysSlot.templateId) {
    return { type: "rest", routineId: activeRoutine.id };
  }

  const [template] = await db
    .select()
    .from(templates)
    .where(eq(templates.id, todaysSlot.templateId))
    .limit(1);
  if (!template) return { type: "rest", routineId: activeRoutine.id };

  const items = await db
    .select({
      exercise: exercises,
      targetSets: templateExercises.targetSets,
      targetReps: templateExercises.targetReps,
      targetWeight: templateExercises.targetWeight,
      targetDurationSeconds: templateExercises.targetDurationSeconds,
      targetSpeed: templateExercises.targetSpeed,
      targetResistance: templateExercises.targetResistance,
    })
    .from(templateExercises)
    .innerJoin(exercises, eq(templateExercises.exerciseId, exercises.id))
    .where(eq(templateExercises.templateId, template.id))
    .orderBy(asc(templateExercises.position));

  return {
    type: "template",
    routineId: activeRoutine.id,
    templateId: template.id,
    templateName: template.name,
    items,
  };
}

export async function getOrCreateSession(
  userId: string,
  dateStr: string,
  plan: TodaysPlan,
  logger: Logger = baseLogger,
) {
  const routineId = plan.type === "none" ? null : plan.routineId;
  const templateId = plan.type === "template" ? plan.templateId : null;
  const isRestDay = plan.type === "rest";

  const inserted = await db
    .insert(workoutSessions)
    .values({ userId, date: dateStr, routineId, templateId, isRestDay })
    .onConflictDoNothing({
      target: [workoutSessions.userId, workoutSessions.date],
    })
    .returning();

  if (inserted.length > 0) {
    logger.info(
      { userId, date: dateStr, routineId, templateId, isRestDay },
      "workout session created",
    );
  }

  const [session] = await db
    .select()
    .from(workoutSessions)
    .where(
      and(eq(workoutSessions.userId, userId), eq(workoutSessions.date, dateStr)),
    )
    .limit(1);

  return session;
}
