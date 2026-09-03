import { describe, expect, it } from "vitest";

import { InMemoryBodyWeightLogsRepository } from "./body-weight-logs-repository.in-memory.server";

describe("InMemoryBodyWeightLogsRepository", () => {
  it("returns an empty list when nothing exists", async () => {
    const repository = new InMemoryBodyWeightLogsRepository();

    expect(await repository.listRecentForUser("user-1", 10)).toEqual([]);
  });

  it("logs a new entry for a date", async () => {
    const repository = new InMemoryBodyWeightLogsRepository();

    const log = await repository.logForDate("user-1", "2026-09-01", 180.5);

    expect(log.weight).toBe("180.5");
    expect(log.date).toBe("2026-09-01");
    const rows = await repository.listRecentForUser("user-1", 10);
    expect(rows).toEqual([log]);
  });

  it("logging again for the same date corrects that entry instead of duplicating it", async () => {
    const repository = new InMemoryBodyWeightLogsRepository();
    const first = await repository.logForDate("user-1", "2026-09-01", 180);

    const second = await repository.logForDate("user-1", "2026-09-01", 179);

    expect(second.id).toBe(first.id);
    const rows = await repository.listRecentForUser("user-1", 10);
    expect(rows).toEqual([second]);
    expect(rows[0].weight).toBe("179");
  });

  it("lists only the requesting user's logs, most recent date first", async () => {
    const repository = new InMemoryBodyWeightLogsRepository();
    await repository.logForDate("user-1", "2026-09-01", 180);
    await repository.logForDate("user-1", "2026-09-03", 179);
    await repository.logForDate("user-2", "2026-09-02", 200);

    const rows = await repository.listRecentForUser("user-1", 10);

    expect(rows.map((r) => r.date)).toEqual(["2026-09-03", "2026-09-01"]);
  });

  it("respects the limit", async () => {
    const repository = new InMemoryBodyWeightLogsRepository();
    await repository.logForDate("user-1", "2026-09-01", 180);
    await repository.logForDate("user-1", "2026-09-02", 179);

    const rows = await repository.listRecentForUser("user-1", 1);

    expect(rows).toHaveLength(1);
  });

  it("only removes a log owned by the requesting user", async () => {
    const repository = new InMemoryBodyWeightLogsRepository();
    const log = await repository.logForDate("user-1", "2026-09-01", 180);

    expect(await repository.removeOwnedByUser("user-2", log.id)).toBe(
      "not-found",
    );
    expect(await repository.listRecentForUser("user-1", 10)).toEqual([log]);

    expect(await repository.removeOwnedByUser("user-1", log.id)).toBe(
      "removed",
    );
    expect(await repository.listRecentForUser("user-1", 10)).toEqual([]);
  });

  it("returns not-found when removing a log that doesn't exist", async () => {
    const repository = new InMemoryBodyWeightLogsRepository();

    expect(await repository.removeOwnedByUser("user-1", "missing")).toBe(
      "not-found",
    );
  });
});
