import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Exercise, Routine, RoutineSlot, WorkoutSession } from "~/db/schema";
import { dbChain } from "~/test/db-chain";
import { mock } from "~/test/mock";

const { selectMock, insertMock } = vi.hoisted(() => ({
  selectMock: vi.fn(),
  insertMock: vi.fn(),
}));

vi.mock("~/db/index.server", () => ({
  db: mock<typeof import("~/db/index.server").db>({
    select: selectMock,
    insert: insertMock,
  }),
}));

const { getOrCreateSession, getTodaysPlan } = await import(
  "./todays-plan.server"
);

function routine(overrides: Partial<Routine> = {}): Routine {
  return mock<Routine>({
    id: "routine-1",
    anchorDate: "2026-09-01",
    ...overrides,
  });
}

function slot(overrides: Partial<RoutineSlot>): RoutineSlot {
  return mock<RoutineSlot>(overrides);
}

describe("getTodaysPlan", () => {
  beforeEach(() => {
    selectMock.mockReset();
  });

  it("returns type none when the user has no active routine", async () => {
    selectMock.mockReturnValueOnce(dbChain([]));

    const plan = await getTodaysPlan("user-1", "2026-09-02");

    expect(plan).toEqual({ type: "none" });
  });

  it("returns type none when the active routine has no slots", async () => {
    selectMock
      .mockReturnValueOnce(dbChain([routine()]))
      .mockReturnValueOnce(dbChain([]));

    const plan = await getTodaysPlan("user-1", "2026-09-02");

    expect(plan).toEqual({ type: "none" });
  });

  it("returns a rest day when today's cycle slot has no template", async () => {
    selectMock
      .mockReturnValueOnce(dbChain([routine()]))
      .mockReturnValueOnce(
        dbChain([
          slot({ id: "slot-0", position: 0, templateId: null }),
          slot({ id: "slot-1", position: 1, templateId: "template-1" }),
        ]),
      );

    // Anchor 2026-09-01, target 2026-09-01 -> slot index 0 (rest).
    const plan = await getTodaysPlan("user-1", "2026-09-01");

    expect(plan).toEqual({ type: "rest", routineId: "routine-1" });
  });

  it("returns a rest day when the slot's template has since been deleted", async () => {
    selectMock
      .mockReturnValueOnce(dbChain([routine()]))
      .mockReturnValueOnce(
        dbChain([
          slot({ id: "slot-0", position: 0, templateId: "missing-template" }),
        ]),
      )
      .mockReturnValueOnce(dbChain([])); // template lookup comes back empty

    const plan = await getTodaysPlan("user-1", "2026-09-01");

    expect(plan).toEqual({ type: "rest", routineId: "routine-1" });
  });

  it("returns the template and its exercise items for a workout day", async () => {
    const exercise = mock<Exercise>({ id: "exercise-1", name: "Bench Press" });
    const item = {
      exercise,
      targetSets: 3,
      targetReps: 10,
      targetWeight: "135.00",
      targetDurationSeconds: null,
      targetSpeed: null,
      targetResistance: null,
    };
    selectMock
      .mockReturnValueOnce(dbChain([routine()]))
      .mockReturnValueOnce(
        dbChain([slot({ id: "slot-0", position: 0, templateId: "template-1" })]),
      )
      .mockReturnValueOnce(
        dbChain([{ id: "template-1", name: "Push Day" }]),
      )
      .mockReturnValueOnce(dbChain([item]));

    const plan = await getTodaysPlan("user-1", "2026-09-01");

    expect(plan).toEqual({
      type: "template",
      routineId: "routine-1",
      templateId: "template-1",
      templateName: "Push Day",
      items: [item],
    });
  });

  it("defaults dateStr to today when omitted", async () => {
    selectMock.mockReturnValueOnce(dbChain([]));

    await getTodaysPlan("user-1");

    expect(selectMock).toHaveBeenCalledTimes(1);
  });
});

describe("getOrCreateSession", () => {
  beforeEach(() => {
    selectMock.mockReset();
    insertMock.mockReset();
    insertMock.mockReturnValue(dbChain(undefined));
  });

  it("inserts (ignoring conflicts) and returns the session row for the date", async () => {
    const session = mock<WorkoutSession>({
      id: "session-1",
      userId: "user-1",
      date: "2026-09-02",
    });
    selectMock.mockReturnValueOnce(dbChain([session]));

    const result = await getOrCreateSession("user-1", "2026-09-02", {
      type: "rest",
      routineId: "routine-1",
    });

    expect(insertMock).toHaveBeenCalledTimes(1);
    expect(result).toBe(session);
  });

  it("still inserts and queries for a plan of type none", async () => {
    selectMock.mockReturnValueOnce(dbChain([]));

    const result = await getOrCreateSession("user-1", "2026-09-02", {
      type: "none",
    });

    expect(insertMock).toHaveBeenCalledTimes(1);
    expect(result).toBeUndefined();
  });
});
