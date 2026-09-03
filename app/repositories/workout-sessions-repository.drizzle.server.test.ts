import { beforeEach, describe, expect, it, vi } from "vitest";

import type { SessionSet, WorkoutSession } from "~/db/schema";
import { dbChain } from "~/test/db-chain";
import { mock } from "~/test/mock";

const {
  selectMock,
  insertMock,
  deleteMock,
  workoutSessionsFindFirstMock,
  workoutSessionsFindManyMock,
  sessionSetsFindFirstMock,
} = vi.hoisted(() => ({
  selectMock: vi.fn(),
  insertMock: vi.fn(),
  deleteMock: vi.fn(),
  workoutSessionsFindFirstMock: vi.fn(),
  workoutSessionsFindManyMock: vi.fn(),
  sessionSetsFindFirstMock: vi.fn(),
}));

vi.mock("~/db/index.server", () => ({
  db: mock<typeof import("~/db/index.server").db>({
    select: selectMock,
    insert: insertMock,
    delete: deleteMock,
    query: mock<typeof import("~/db/index.server").db.query>({
      workoutSessions: mock({
        findFirst: workoutSessionsFindFirstMock,
        findMany: workoutSessionsFindManyMock,
      }),
      sessionSets: mock({ findFirst: sessionSetsFindFirstMock }),
    }),
  }),
}));

const { DrizzleWorkoutSessionsRepository } = await import(
  "./workout-sessions-repository.drizzle.server"
);

describe("DrizzleWorkoutSessionsRepository", () => {
  beforeEach(() => {
    selectMock.mockReset();
    insertMock.mockReset();
    deleteMock.mockReset();
    workoutSessionsFindFirstMock.mockReset();
    workoutSessionsFindManyMock.mockReset();
    sessionSetsFindFirstMock.mockReset();
  });

  describe("getOrCreateForDate", () => {
    it("reports created when the insert lands", async () => {
      const session = mock<WorkoutSession>({ id: "session-1" });
      insertMock.mockReturnValueOnce(dbChain([session]));
      const repository = new DrizzleWorkoutSessionsRepository();

      const result = await repository.getOrCreateForDate(
        "user-1",
        "2026-09-02",
        { routineId: "routine-1", templateId: null, isRestDay: false },
      );

      expect(result).toEqual({ session, created: true });
    });

    it("falls back to a select and reports not-created on conflict", async () => {
      const session = mock<WorkoutSession>({ id: "session-1" });
      insertMock.mockReturnValueOnce(dbChain([]));
      selectMock.mockReturnValueOnce(dbChain([session]));
      const repository = new DrizzleWorkoutSessionsRepository();

      const result = await repository.getOrCreateForDate(
        "user-1",
        "2026-09-02",
        { routineId: null, templateId: null, isRestDay: true },
      );

      expect(result).toEqual({ session, created: false });
    });
  });

  it("findWithSetsForDate passes through the relational query result", async () => {
    const session = mock<WorkoutSession>({ id: "session-1" });
    workoutSessionsFindFirstMock.mockResolvedValue(session);
    const repository = new DrizzleWorkoutSessionsRepository();

    expect(
      await repository.findWithSetsForDate("user-1", "2026-09-02"),
    ).toBe(session);
  });

  it("findWithSetsForDate returns null when nothing matches", async () => {
    workoutSessionsFindFirstMock.mockResolvedValue(undefined);
    const repository = new DrizzleWorkoutSessionsRepository();

    expect(
      await repository.findWithSetsForDate("user-1", "2026-09-02"),
    ).toBeNull();
  });

  it("listRecentWithSetsForUser passes through the relational query result", async () => {
    const sessions = [mock<WorkoutSession>({ id: "session-1" })];
    workoutSessionsFindManyMock.mockResolvedValue(sessions);
    const repository = new DrizzleWorkoutSessionsRepository();

    expect(await repository.listRecentWithSetsForUser("user-1", 90)).toBe(
      sessions,
    );
  });

  it("listForDateRange passes through the query result", async () => {
    const sessions = [mock<WorkoutSession>({ id: "session-1" })];
    selectMock.mockReturnValueOnce(dbChain(sessions));
    const repository = new DrizzleWorkoutSessionsRepository();

    expect(
      await repository.listForDateRange("user-1", "2026-08-26", "2026-09-02"),
    ).toBe(sessions);
  });

  it("listSetSessionExercisePairs returns an empty array without querying for no sessions", async () => {
    const repository = new DrizzleWorkoutSessionsRepository();

    expect(await repository.listSetSessionExercisePairs([])).toEqual([]);
    expect(selectMock).not.toHaveBeenCalled();
  });

  it("listSetSessionExercisePairs passes through the query result", async () => {
    const pairs = [{ sessionId: "session-1", exerciseId: "ex-1" }];
    selectMock.mockReturnValueOnce(dbChain(pairs));
    const repository = new DrizzleWorkoutSessionsRepository();

    expect(
      await repository.listSetSessionExercisePairs(["session-1"]),
    ).toBe(pairs);
  });

  it("addSet assigns the next setNumber for the (session, exercise) pair", async () => {
    selectMock.mockReturnValueOnce(
      dbChain([mock<SessionSet>({}), mock<SessionSet>({})]),
    );
    const created = mock<SessionSet>({ id: "set-1", setNumber: 3 });
    insertMock.mockReturnValueOnce(dbChain([created]));
    const repository = new DrizzleWorkoutSessionsRepository();

    const result = await repository.addSet("session-1", "ex-1", {
      reps: 10,
    });

    expect(result).toBe(created);
  });

  describe("removeSetOwnedByUser", () => {
    it("returns not-found when the set doesn't exist", async () => {
      sessionSetsFindFirstMock.mockResolvedValue(undefined);
      const repository = new DrizzleWorkoutSessionsRepository();

      expect(
        await repository.removeSetOwnedByUser("user-1", "missing"),
      ).toBe("not-found");
      expect(deleteMock).not.toHaveBeenCalled();
    });

    it("returns not-found when the set belongs to another user", async () => {
      sessionSetsFindFirstMock.mockResolvedValue({
        id: "set-1",
        session: { userId: "user-2" },
      });
      const repository = new DrizzleWorkoutSessionsRepository();

      expect(
        await repository.removeSetOwnedByUser("user-1", "set-1"),
      ).toBe("not-found");
      expect(deleteMock).not.toHaveBeenCalled();
    });

    it("deletes and returns removed when the set is owned by the user", async () => {
      sessionSetsFindFirstMock.mockResolvedValue({
        id: "set-1",
        session: { userId: "user-1" },
      });
      deleteMock.mockReturnValue(dbChain(undefined));
      const repository = new DrizzleWorkoutSessionsRepository();

      expect(
        await repository.removeSetOwnedByUser("user-1", "set-1"),
      ).toBe("removed");
      expect(deleteMock).toHaveBeenCalledTimes(1);
    });
  });
});
