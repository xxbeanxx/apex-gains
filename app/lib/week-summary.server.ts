import { and, eq, gte, inArray, lt } from "drizzle-orm";

import { db } from "~/db/index.server";
import { routineSlots, routines, sessionSets, templates, workoutSessions } from "~/db/schema";

import { addDays, slotIndexForDate, todayDateString } from "./cycle";

export type WeekPlanDay =
  | { date: string; type: "none" }
  | { date: string; type: "rest" }
  | { date: string; type: "template"; templateName: string };

/** The next 7 days (starting from `fromDate`) according to the active routine's cycle. */
export async function getUpcomingWeekPlan(
  userId: string,
  fromDate: string = todayDateString(),
): Promise<WeekPlanDay[]> {
  const dates = Array.from({ length: 7 }, (_, i) => addDays(fromDate, i));

  const [activeRoutine] = await db
    .select()
    .from(routines)
    .where(and(eq(routines.userId, userId), eq(routines.isActive, true)))
    .limit(1);
  if (!activeRoutine) {
    return dates.map((date) => ({ date, type: "none" as const }));
  }

  const slots = await db
    .select()
    .from(routineSlots)
    .where(eq(routineSlots.routineId, activeRoutine.id))
    .orderBy(routineSlots.position);
  if (slots.length === 0) {
    return dates.map((date) => ({ date, type: "none" as const }));
  }

  const templateIds = [
    ...new Set(
      slots
        .map((s) => s.templateId)
        .filter((id): id is string => id !== null),
    ),
  ];
  const templateRows =
    templateIds.length > 0
      ? await db
          .select({ id: templates.id, name: templates.name })
          .from(templates)
          .where(inArray(templates.id, templateIds))
      : [];
  const templateNameById = new Map(templateRows.map((t) => [t.id, t.name]));

  return dates.map((date) => {
    const slotIndex = slotIndexForDate(
      activeRoutine.anchorDate,
      slots.length,
      date,
    );
    const slot = slots[slotIndex];
    if (!slot.templateId) return { date, type: "rest" as const };
    return {
      date,
      type: "template" as const,
      templateName: templateNameById.get(slot.templateId) ?? "Unknown",
    };
  });
}

export type WeekHistoryDay = {
  date: string;
  status: "workout" | "rest" | "none";
  exerciseCount: number;
  setCount: number;
};

/** The 7 days before `throughDateExclusive` (defaults to today), from actual logged history. */
export async function getPastWeekSummary(
  userId: string,
  throughDateExclusive: string = todayDateString(),
): Promise<WeekHistoryDay[]> {
  const startDate = addDays(throughDateExclusive, -7);
  const dates = Array.from({ length: 7 }, (_, i) => addDays(startDate, i));

  const sessions = await db
    .select()
    .from(workoutSessions)
    .where(
      and(
        eq(workoutSessions.userId, userId),
        gte(workoutSessions.date, startDate),
        lt(workoutSessions.date, throughDateExclusive),
      ),
    );

  const sets =
    sessions.length > 0
      ? await db
          .select({
            sessionId: sessionSets.sessionId,
            exerciseId: sessionSets.exerciseId,
          })
          .from(sessionSets)
          .where(
            inArray(
              sessionSets.sessionId,
              sessions.map((s) => s.id),
            ),
          )
      : [];

  const setsBySession = new Map<string, typeof sets>();
  for (const row of sets) {
    const list = setsBySession.get(row.sessionId) ?? [];
    list.push(row);
    setsBySession.set(row.sessionId, list);
  }

  const sessionByDate = new Map(sessions.map((s) => [s.date, s]));

  return dates.map((date) => {
    const session = sessionByDate.get(date);
    if (!session) {
      return { date, status: "none" as const, exerciseCount: 0, setCount: 0 };
    }
    const sessionSetsRows = setsBySession.get(session.id) ?? [];
    if (sessionSetsRows.length === 0) {
      return {
        date,
        status: session.isRestDay ? ("rest" as const) : ("none" as const),
        exerciseCount: 0,
        setCount: 0,
      };
    }
    const exerciseIds = new Set(sessionSetsRows.map((s) => s.exerciseId));
    return {
      date,
      status: "workout" as const,
      exerciseCount: exerciseIds.size,
      setCount: sessionSetsRows.length,
    };
  });
}
