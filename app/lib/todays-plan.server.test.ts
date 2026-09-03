import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Exercise, RoutineSlot, WorkoutSession } from "~/db/schema";
import type { RoutineDetail, RoutinesRepository } from "~/repositories/routines-repository";
import type {
  TemplateDetail,
  TemplatesRepository,
} from "~/repositories/templates-repository";
import type { WorkoutSessionsRepository } from "~/repositories/workout-sessions-repository";
import { mock } from "~/test/mock";

const {
  findActiveForUserMock,
  findVisibleTemplateMock,
  getOrCreateForDateMock,
} = vi.hoisted(() => ({
  findActiveForUserMock: vi.fn(),
  findVisibleTemplateMock: vi.fn(),
  getOrCreateForDateMock: vi.fn(),
}));

vi.mock("~/repositories/routines-repository.server", () => ({
  getRoutinesRepository: vi
    .fn()
    .mockResolvedValue(
      mock<RoutinesRepository>({ findActiveForUser: findActiveForUserMock }),
    ),
}));

vi.mock("~/repositories/templates-repository.server", () => ({
  getTemplatesRepository: vi
    .fn()
    .mockResolvedValue(
      mock<TemplatesRepository>({
        findVisibleForUser: findVisibleTemplateMock,
      }),
    ),
}));

vi.mock("~/repositories/workout-sessions-repository.server", () => ({
  getWorkoutSessionsRepository: vi.fn().mockResolvedValue(
    mock<WorkoutSessionsRepository>({
      getOrCreateForDate: getOrCreateForDateMock,
    }),
  ),
}));

const { getOrCreateSession, getTodaysPlan } = await import(
  "./todays-plan.server"
);

function routine(overrides: Partial<RoutineDetail> = {}): RoutineDetail {
  return mock<RoutineDetail>({
    id: "routine-1",
    anchorDate: "2026-09-01",
    slots: [],
    ...overrides,
  });
}

function slot(
  overrides: Partial<RoutineSlot> & { template?: unknown },
): RoutineDetail["slots"][number] {
  return mock<RoutineDetail["slots"][number]>(overrides);
}

describe("getTodaysPlan", () => {
  beforeEach(() => {
    findActiveForUserMock.mockReset();
    findVisibleTemplateMock.mockReset();
  });

  it("returns type none when the user has no active routine", async () => {
    findActiveForUserMock.mockResolvedValue(null);

    const plan = await getTodaysPlan("user-1", "2026-09-02");

    expect(plan).toEqual({ type: "none" });
  });

  it("returns type none when the active routine has no slots", async () => {
    findActiveForUserMock.mockResolvedValue(routine({ slots: [] }));

    const plan = await getTodaysPlan("user-1", "2026-09-02");

    expect(plan).toEqual({ type: "none" });
  });

  it("returns a rest day when today's cycle slot has no template", async () => {
    findActiveForUserMock.mockResolvedValue(
      routine({
        slots: [
          slot({ id: "slot-0", position: 0, templateId: null }),
          slot({ id: "slot-1", position: 1, templateId: "template-1" }),
        ],
      }),
    );

    // Anchor 2026-09-01, target 2026-09-01 -> slot index 0 (rest).
    const plan = await getTodaysPlan("user-1", "2026-09-01");

    expect(plan).toEqual({ type: "rest", routineId: "routine-1" });
  });

  it("returns a rest day when the slot's template has since been deleted", async () => {
    findActiveForUserMock.mockResolvedValue(
      routine({
        slots: [
          slot({ id: "slot-0", position: 0, templateId: "missing-template" }),
        ],
      }),
    );
    findVisibleTemplateMock.mockResolvedValue(null);

    const plan = await getTodaysPlan("user-1", "2026-09-01");

    expect(plan).toEqual({ type: "rest", routineId: "routine-1" });
  });

  it("returns the template and its exercise items for a workout day", async () => {
    const exercise = mock<Exercise>({ id: "exercise-1", name: "Bench Press" });
    const templateExercise = {
      exercise,
      targetSets: 3,
      targetReps: 10,
      targetWeight: "135.00",
      targetDurationSeconds: null,
      targetSpeed: null,
      targetResistance: null,
    };
    findActiveForUserMock.mockResolvedValue(
      routine({
        slots: [
          slot({ id: "slot-0", position: 0, templateId: "template-1" }),
        ],
      }),
    );
    findVisibleTemplateMock.mockResolvedValue(
      mock<TemplateDetail>({
        id: "template-1",
        name: "Push Day",
        templateExercises: [templateExercise],
      }),
    );

    const plan = await getTodaysPlan("user-1", "2026-09-01");

    expect(plan).toEqual({
      type: "template",
      routineId: "routine-1",
      templateId: "template-1",
      templateName: "Push Day",
      items: [
        {
          exercise,
          targetSets: 3,
          targetReps: 10,
          targetWeight: "135.00",
          targetDurationSeconds: null,
          targetSpeed: null,
          targetResistance: null,
        },
      ],
    });
  });

  it("defaults dateStr to today when omitted", async () => {
    findActiveForUserMock.mockResolvedValue(null);

    await getTodaysPlan("user-1");

    expect(findActiveForUserMock).toHaveBeenCalledWith("user-1");
  });
});

describe("getOrCreateSession", () => {
  beforeEach(() => {
    getOrCreateForDateMock.mockReset();
  });

  it("returns the session and logs when a new one is created", async () => {
    const session = mock<WorkoutSession>({
      id: "session-1",
      userId: "user-1",
      date: "2026-09-02",
    });
    getOrCreateForDateMock.mockResolvedValue({ session, created: true });

    const result = await getOrCreateSession("user-1", "2026-09-02", {
      type: "rest",
      routineId: "routine-1",
    });

    expect(getOrCreateForDateMock).toHaveBeenCalledWith(
      "user-1",
      "2026-09-02",
      { routineId: "routine-1", templateId: null, isRestDay: true },
    );
    expect(result).toBe(session);
  });

  it("returns the existing session without logging when one already exists", async () => {
    const session = mock<WorkoutSession>({ id: "session-1" });
    getOrCreateForDateMock.mockResolvedValue({ session, created: false });

    const result = await getOrCreateSession("user-1", "2026-09-02", {
      type: "none",
    });

    expect(getOrCreateForDateMock).toHaveBeenCalledWith(
      "user-1",
      "2026-09-02",
      { routineId: null, templateId: null, isRestDay: false },
    );
    expect(result).toBe(session);
  });
});
