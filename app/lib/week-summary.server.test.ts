import { beforeEach, describe, expect, it, vi } from "vitest";

import type { WorkoutSession } from "~/db/schema";
import type { RoutineDetail, RoutinesRepository } from "~/repositories/routines-repository";
import type { WorkoutSessionsRepository } from "~/repositories/workout-sessions-repository";
import { mock } from "~/test/mock";

const { findActiveForUserMock, listForDateRangeMock, listSetPairsMock } =
  vi.hoisted(() => ({
    findActiveForUserMock: vi.fn(),
    listForDateRangeMock: vi.fn(),
    listSetPairsMock: vi.fn(),
  }));

vi.mock("~/repositories/routines-repository.server", () => ({
  getRoutinesRepository: vi
    .fn()
    .mockResolvedValue(
      mock<RoutinesRepository>({ findActiveForUser: findActiveForUserMock }),
    ),
}));

vi.mock("~/repositories/workout-sessions-repository.server", () => ({
  getWorkoutSessionsRepository: vi.fn().mockResolvedValue(
    mock<WorkoutSessionsRepository>({
      listForDateRange: listForDateRangeMock,
      listSetSessionExercisePairs: listSetPairsMock,
    }),
  ),
}));

const { getPastWeekSummary, getUpcomingWeekPlan } = await import(
  "./week-summary.server"
);

function routine(overrides: Partial<RoutineDetail> = {}): RoutineDetail {
  return mock<RoutineDetail>({
    id: "routine-1",
    anchorDate: "2026-09-01",
    slots: [],
    ...overrides,
  });
}

function slot(overrides: {
  [K in keyof RoutineDetail["slots"][number]]?: unknown;
}): RoutineDetail["slots"][number] {
  return mock<RoutineDetail["slots"][number]>(overrides);
}

describe("getUpcomingWeekPlan", () => {
  beforeEach(() => {
    findActiveForUserMock.mockReset();
  });

  it("returns 7 days of type none when there is no active routine", async () => {
    findActiveForUserMock.mockResolvedValue(null);

    const plan = await getUpcomingWeekPlan("user-1", "2026-09-02");

    expect(plan).toHaveLength(7);
    expect(plan[0]).toEqual({ date: "2026-09-02", type: "none" });
    expect(plan[6]).toEqual({ date: "2026-09-08", type: "none" });
  });

  it("returns 7 days of type none when the active routine has no slots", async () => {
    findActiveForUserMock.mockResolvedValue(routine({ slots: [] }));

    const plan = await getUpcomingWeekPlan("user-1", "2026-09-02");

    expect(plan.every((d) => d.type === "none")).toBe(true);
  });

  it("maps each day of the cycle to rest or a template name", async () => {
    findActiveForUserMock.mockResolvedValue(
      routine({
        anchorDate: "2026-09-02",
        slots: [
          slot({
            id: "s0",
            position: 0,
            templateId: "template-1",
            template: { name: "Push Day" },
          }),
          slot({ id: "s1", position: 1, templateId: null, template: null }),
        ],
      }),
    );

    const plan = await getUpcomingWeekPlan("user-1", "2026-09-02");

    expect(plan[0]).toEqual({
      date: "2026-09-02",
      type: "template",
      templateName: "Push Day",
    });
    expect(plan[1]).toEqual({ date: "2026-09-03", type: "rest" });
    // Cycle length 2 wraps back to the template slot on day 3.
    expect(plan[2]).toEqual({
      date: "2026-09-04",
      type: "template",
      templateName: "Push Day",
    });
  });

  it("falls back to Unknown for a template that no longer exists", async () => {
    findActiveForUserMock.mockResolvedValue(
      routine({
        anchorDate: "2026-09-02",
        slots: [
          slot({
            id: "s0",
            position: 0,
            templateId: "missing",
            template: null,
          }),
        ],
      }),
    );

    const plan = await getUpcomingWeekPlan("user-1", "2026-09-02");

    expect(plan[0]).toEqual({
      date: "2026-09-02",
      type: "template",
      templateName: "Unknown",
    });
  });

  it("defaults fromDate to today when omitted", async () => {
    findActiveForUserMock.mockResolvedValue(null);

    const plan = await getUpcomingWeekPlan("user-1");

    expect(plan).toHaveLength(7);
  });
});

describe("getPastWeekSummary", () => {
  beforeEach(() => {
    listForDateRangeMock.mockReset();
    listSetPairsMock.mockReset();
  });

  it("marks a day with no session row as none", async () => {
    listForDateRangeMock.mockResolvedValue([]);

    const summary = await getPastWeekSummary("user-1", "2026-09-02");

    expect(summary).toHaveLength(7);
    expect(summary.every((d) => d.status === "none")).toBe(true);
    expect(summary[0].date).toBe("2026-08-26");
    expect(summary[6].date).toBe("2026-09-01");
    expect(listSetPairsMock).not.toHaveBeenCalled();
  });

  it("marks a rest-day session with no sets as rest", async () => {
    const session = mock<WorkoutSession>({
      id: "session-1",
      date: "2026-08-30",
      isRestDay: true,
    });
    listForDateRangeMock.mockResolvedValue([session]);
    listSetPairsMock.mockResolvedValue([]);

    const summary = await getPastWeekSummary("user-1", "2026-09-02");
    const day = summary.find((d) => d.date === "2026-08-30");

    expect(day).toEqual({
      date: "2026-08-30",
      status: "rest",
      exerciseCount: 0,
      setCount: 0,
    });
  });

  it("counts distinct exercises and total sets for a workout day", async () => {
    const session = mock<WorkoutSession>({
      id: "session-1",
      date: "2026-08-30",
      isRestDay: false,
    });
    listForDateRangeMock.mockResolvedValue([session]);
    listSetPairsMock.mockResolvedValue([
      { sessionId: "session-1", exerciseId: "ex-1" },
      { sessionId: "session-1", exerciseId: "ex-1" },
      { sessionId: "session-1", exerciseId: "ex-2" },
    ]);

    const summary = await getPastWeekSummary("user-1", "2026-09-02");
    const day = summary.find((d) => d.date === "2026-08-30");

    expect(day).toEqual({
      date: "2026-08-30",
      status: "workout",
      exerciseCount: 2,
      setCount: 3,
    });
  });

  it("does not query sets when there are no sessions in range", async () => {
    listForDateRangeMock.mockResolvedValue([]);

    await getPastWeekSummary("user-1", "2026-09-02");

    expect(listSetPairsMock).not.toHaveBeenCalled();
  });

  it("defaults throughDateExclusive to today when omitted", async () => {
    listForDateRangeMock.mockResolvedValue([]);

    const summary = await getPastWeekSummary("user-1");

    expect(summary).toHaveLength(7);
  });
});
