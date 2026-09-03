import type { Logger } from "pino";

import type { Exercise } from "~/db/schema";
import { getRoutinesRepository } from "~/repositories/routines-repository.server";
import { getTemplatesRepository } from "~/repositories/templates-repository.server";
import { getWorkoutSessionsRepository } from "~/repositories/workout-sessions-repository.server";

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
  const routinesRepository = await getRoutinesRepository();
  const activeRoutine = await routinesRepository.findActiveForUser(userId);
  if (!activeRoutine) return { type: "none" };

  const slots = activeRoutine.slots;
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

  const templatesRepository = await getTemplatesRepository();
  const template = await templatesRepository.findVisibleForUser(
    userId,
    todaysSlot.templateId,
  );
  if (!template) return { type: "rest", routineId: activeRoutine.id };

  const items: TodaysPlanItem[] = template.templateExercises.map((te) => ({
    exercise: te.exercise,
    targetSets: te.targetSets,
    targetReps: te.targetReps,
    targetWeight: te.targetWeight,
    targetDurationSeconds: te.targetDurationSeconds,
    targetSpeed: te.targetSpeed,
    targetResistance: te.targetResistance,
  }));

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

  const workoutSessionsRepository = await getWorkoutSessionsRepository();
  const { session, created } = await workoutSessionsRepository.getOrCreateForDate(
    userId,
    dateStr,
    { routineId, templateId, isRestDay },
  );

  if (created) {
    logger.info(
      { userId, date: dateStr, routineId, templateId, isRestDay },
      "workout session created",
    );
  }

  return session;
}
