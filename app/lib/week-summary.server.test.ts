import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Routine, RoutineSlot, WorkoutSession } from "~/db/schema";
import { dbChain } from "~/test/db-chain";
import { mock } from "~/test/mock";

const { selectMock } = vi.hoisted(() => ({ selectMock: vi.fn() }));

vi.mock("~/db/index.server", () => ({
  db: mock<typeof import("~/db/index.server").db>({ select: selectMock }),
}));

const { getPastWeekSummary, getUpcomingWeekPlan } = await import(
  "./week-summary.server"
);

function routine(overrides: Partial<Routine> = {}): Routine {
  return mock<Routine>({ id: "routine-1", anchorDate: "2026-09-01", ...overrides });
}

function slot(overrides: Partial<RoutineSlot>): RoutineSlot {
  return mock<RoutineSlot>(overrides);
}

describe("getUpcomingWeekPlan", () => {
  beforeEach(() => {
    selectMock.mockReset();
  });

  it("returns 7 days of type none when there is no active routine", async () => {
    selectMock.mockReturnValueOnce(dbChain([]));

    const plan = await getUpcomingWeekPlan("user-1", "2026-09-02");

    expect(plan).toHaveLength(7);
    expect(plan[0]).toEqual({ date: "2026-09-02", type: "none" });
    expect(plan[6]).toEqual({ date: "2026-09-08", type: "none" });
  });

  it("returns 7 days of type none when the active routine has no slots", async () => {
    selectMock
      .mockReturnValueOnce(dbChain([routine()]))
      .mockReturnValueOnce(dbChain([]));

    const plan = await getUpcomingWeekPlan("user-1", "2026-09-02");

    expect(plan.every((d) => d.type === "none")).toBe(true);
  });

  it("maps each day of the cycle to rest or a template name", async () => {
    selectMock
      .mockReturnValueOnce(dbChain([routine({ anchorDate: "2026-09-02" })]))
      .mockReturnValueOnce(
        dbChain([
          slot({ id: "s0", position: 0, templateId: "template-1" }),
          slot({ id: "s1", position: 1, templateId: null }),
        ]),
      )
      .mockReturnValueOnce(
        dbChain([{ id: "template-1", name: "Push Day" }]),
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
    selectMock
      .mockReturnValueOnce(dbChain([routine({ anchorDate: "2026-09-02" })]))
      .mockReturnValueOnce(
        dbChain([slot({ id: "s0", position: 0, templateId: "missing" })]),
      )
      .mockReturnValueOnce(dbChain([]));

    const plan = await getUpcomingWeekPlan("user-1", "2026-09-02");

    expect(plan[0]).toEqual({
      date: "2026-09-02",
      type: "template",
      templateName: "Unknown",
    });
  });

  it("defaults fromDate to today when omitted", async () => {
    selectMock.mockReturnValueOnce(dbChain([]));

    const plan = await getUpcomingWeekPlan("user-1");

    expect(plan).toHaveLength(7);
  });
});

describe("getPastWeekSummary", () => {
  beforeEach(() => {
    selectMock.mockReset();
  });

  it("marks a day with no session row as none", async () => {
    selectMock
      .mockReturnValueOnce(dbChain([])) // sessions
      .mockReturnValueOnce(dbChain([])); // sets (skipped since no sessions)

    const summary = await getPastWeekSummary("user-1", "2026-09-02");

    expect(summary).toHaveLength(7);
    expect(summary.every((d) => d.status === "none")).toBe(true);
    expect(summary[0].date).toBe("2026-08-26");
    expect(summary[6].date).toBe("2026-09-01");
  });

  it("marks a rest-day session with no sets as rest", async () => {
    const session = mock<WorkoutSession>({
      id: "session-1",
      date: "2026-08-30",
      isRestDay: true,
    });
    selectMock
      .mockReturnValueOnce(dbChain([session]))
      .mockReturnValueOnce(dbChain([]));

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
    selectMock.mockReturnValueOnce(dbChain([session])).mockReturnValueOnce(
      dbChain([
        { sessionId: "session-1", exerciseId: "ex-1" },
        { sessionId: "session-1", exerciseId: "ex-1" },
        { sessionId: "session-1", exerciseId: "ex-2" },
      ]),
    );

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
    selectMock.mockReturnValueOnce(dbChain([]));

    await getPastWeekSummary("user-1", "2026-09-02");

    expect(selectMock).toHaveBeenCalledTimes(1);
  });

  it("defaults throughDateExclusive to today when omitted", async () => {
    selectMock.mockReturnValueOnce(dbChain([]));

    const summary = await getPastWeekSummary("user-1");

    expect(summary).toHaveLength(7);
  });
});
