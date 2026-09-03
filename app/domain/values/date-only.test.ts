import { describe, expect, it } from "vitest";

import { DateOnly } from "./date-only";

describe("DateOnly.tryParse", () => {
  it("accepts a well-formed calendar day", () => {
    expect(DateOnly.tryParse("2026-09-03")?.value).toBe("2026-09-03");
  });

  it.each([
    ["the wrong shape", "3 Sep 2026"],
    ["a two-digit year", "26-09-03"],
    ["a missing pad", "2026-9-3"],
    ["an empty string", ""],
    ["null", null],
  ])("rejects %s", (_label, input) => {
    expect(DateOnly.tryParse(input)).toBeNull();
  });

  it("rejects a day that doesn't exist in that month", () => {
    expect(DateOnly.tryParse("2026-02-30")).toBeNull();
  });

  it("accepts 29 February in a leap year", () => {
    expect(DateOnly.tryParse("2028-02-29")?.value).toBe("2028-02-29");
  });
});

describe("DateOnly.today", () => {
  it("reads the local calendar day, not UTC's", () => {
    // 22:30 on the 3rd in a UTC-05:00 zone is already the 4th in UTC. The
    // athlete is training on the 3rd, so that is the day that counts.
    const lateEvening = new Date(2026, 8, 3, 22, 30);
    expect(DateOnly.today(lateEvening).value).toBe("2026-09-03");
  });
});

describe("day arithmetic", () => {
  it("counts whole days between two dates", () => {
    const from = DateOnly.parse("2026-09-01");
    expect(from.daysUntil(DateOnly.parse("2026-09-08"))).toBe(7);
  });

  it("counts backwards as a negative", () => {
    const from = DateOnly.parse("2026-09-08");
    expect(from.daysUntil(DateOnly.parse("2026-09-01"))).toBe(-7);
  });

  /**
   * The arithmetic is done in UTC precisely so a daylight-saving change -
   * a 23- or 25-hour local day - can't round to the wrong number of days.
   */
  it("is unaffected by a daylight-saving transition", () => {
    const before = DateOnly.parse("2026-03-07");
    expect(before.daysUntil(DateOnly.parse("2026-03-10"))).toBe(3);
    expect(before.plusDays(3).value).toBe("2026-03-10");
  });

  it("crosses a month boundary", () => {
    expect(DateOnly.parse("2026-08-31").plusDays(1).value).toBe("2026-09-01");
  });

  it("crosses a year boundary backwards", () => {
    expect(DateOnly.parse("2026-01-01").minusDays(1).value).toBe("2025-12-31");
  });

  it("produces a consecutive run of days", () => {
    expect(DateOnly.parse("2026-09-01").range(3).map(String)).toEqual([
      "2026-09-01",
      "2026-09-02",
      "2026-09-03",
    ]);
  });
});

describe("startOfWeek", () => {
  it("returns the same day for a Monday", () => {
    // 2026-08-31 is a Monday.
    expect(DateOnly.parse("2026-08-31").startOfWeek().value).toBe("2026-08-31");
  });

  it("walks back to Monday from midweek", () => {
    expect(DateOnly.parse("2026-09-03").startOfWeek().value).toBe("2026-08-31");
  });

  it("treats Sunday as the end of its week, not the start", () => {
    // 2026-09-06 is a Sunday; its week began on the Monday six days earlier.
    expect(DateOnly.parse("2026-09-06").startOfWeek().value).toBe("2026-08-31");
  });
});

describe("comparison", () => {
  const early = DateOnly.parse("2026-09-01");
  const late = DateOnly.parse("2026-09-08");

  it("orders two days", () => {
    expect(early.isBefore(late)).toBe(true);
    expect(late.isAfter(early)).toBe(true);
    expect(early.isOnOrBefore(early)).toBe(true);
  });

  it("clamps a forward-dated day back onto the limit", () => {
    expect(late.atMost(early).value).toBe("2026-09-01");
  });

  it("leaves a day that is already within the limit alone", () => {
    expect(early.atMost(late).value).toBe("2026-09-01");
  });

  it("tests an inclusive range", () => {
    const middle = DateOnly.parse("2026-09-04");
    expect(middle.isBetween(early, late)).toBe(true);
    expect(early.isBetween(early, late)).toBe(true);
    expect(late.isBetween(early, late)).toBe(true);
    expect(DateOnly.parse("2026-09-09").isBetween(early, late)).toBe(false);
  });
});
