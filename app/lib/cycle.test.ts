import { describe, expect, it } from "vitest";

import {
  addDays,
  daysBetweenDateStrings,
  formatFullDate,
  formatRelativeDate,
  isValidDateString,
  slotIndexForDate,
  todayDateString,
} from "./cycle";

describe("todayDateString", () => {
  it("formats a date as YYYY-MM-DD in local time", () => {
    expect(todayDateString(new Date(2026, 8, 2))).toBe("2026-09-02");
  });

  it("zero-pads single-digit months and days", () => {
    expect(todayDateString(new Date(2026, 0, 5))).toBe("2026-01-05");
  });
});

describe("isValidDateString", () => {
  it("accepts a well-formed calendar date", () => {
    expect(isValidDateString("2026-09-02")).toBe(true);
  });

  it("rejects strings that don't match the YYYY-MM-DD shape", () => {
    expect(isValidDateString("09/02/2026")).toBe(false);
    expect(isValidDateString("2026-9-2")).toBe(false);
    expect(isValidDateString("")).toBe(false);
  });

  it("rejects calendar-shaped strings that aren't real dates", () => {
    expect(isValidDateString("2026-13-40")).toBe(false);
  });
});

describe("daysBetweenDateStrings", () => {
  it("returns 0 for the same date", () => {
    expect(daysBetweenDateStrings("2026-09-02", "2026-09-02")).toBe(0);
  });

  it("returns a positive count moving forward", () => {
    expect(daysBetweenDateStrings("2026-09-02", "2026-09-10")).toBe(8);
  });

  it("returns a negative count moving backward", () => {
    expect(daysBetweenDateStrings("2026-09-10", "2026-09-02")).toBe(-8);
  });

  it("crosses a month boundary correctly", () => {
    expect(daysBetweenDateStrings("2026-01-30", "2026-02-02")).toBe(3);
  });
});

describe("addDays", () => {
  it("adds a positive delta", () => {
    expect(addDays("2026-09-02", 5)).toBe("2026-09-07");
  });

  it("subtracts with a negative delta", () => {
    expect(addDays("2026-09-02", -5)).toBe("2026-08-28");
  });

  it("rolls over a year boundary", () => {
    expect(addDays("2025-12-30", 5)).toBe("2026-01-04");
  });

  it("is a no-op for delta 0", () => {
    expect(addDays("2026-09-02", 0)).toBe("2026-09-02");
  });
});

describe("formatFullDate", () => {
  it("renders weekday, month, and day", () => {
    // 2026-09-02 is a Wednesday.
    expect(formatFullDate("2026-09-02")).toBe("Wednesday, September 2");
  });
});

describe("formatRelativeDate", () => {
  it("labels the same date as Today", () => {
    expect(formatRelativeDate("2026-09-02", "2026-09-02")).toBe("Today");
  });

  it("labels the day before as Yesterday", () => {
    expect(formatRelativeDate("2026-09-01", "2026-09-02")).toBe("Yesterday");
  });

  it("labels the day after as Tomorrow", () => {
    expect(formatRelativeDate("2026-09-03", "2026-09-02")).toBe("Tomorrow");
  });

  it("falls back to the full date otherwise", () => {
    expect(formatRelativeDate("2026-08-20", "2026-09-02")).toBe(
      formatFullDate("2026-08-20"),
    );
  });

  it("defaults `today` to the current date when omitted", () => {
    expect(formatRelativeDate(todayDateString())).toBe("Today");
  });
});

describe("slotIndexForDate", () => {
  it("returns 0 on the anchor date", () => {
    expect(slotIndexForDate("2026-09-02", 5, "2026-09-02")).toBe(0);
  });

  it("advances one slot per day", () => {
    expect(slotIndexForDate("2026-09-02", 5, "2026-09-03")).toBe(1);
    expect(slotIndexForDate("2026-09-02", 5, "2026-09-04")).toBe(2);
  });

  it("wraps forward past the cycle length", () => {
    expect(slotIndexForDate("2026-09-02", 5, "2026-09-07")).toBe(0);
    expect(slotIndexForDate("2026-09-02", 5, "2026-09-08")).toBe(1);
  });

  it("wraps for dates before the anchor date", () => {
    // One day before anchor is the last slot of the cycle.
    expect(slotIndexForDate("2026-09-02", 5, "2026-09-01")).toBe(4);
  });

  it("is independent of the anchor's weekday - only the day count matters", () => {
    expect(slotIndexForDate("2026-09-02", 7, "2026-09-09")).toBe(0);
  });

  it("handles a cycle length of 1", () => {
    expect(slotIndexForDate("2026-09-02", 1, "2026-09-02")).toBe(0);
    expect(slotIndexForDate("2026-09-02", 1, "2026-10-15")).toBe(0);
  });

  it("throws for a non-positive cycle length", () => {
    expect(() => slotIndexForDate("2026-09-02", 0, "2026-09-02")).toThrow(
      "cycleLength must be positive",
    );
    expect(() => slotIndexForDate("2026-09-02", -1, "2026-09-02")).toThrow(
      "cycleLength must be positive",
    );
  });
});
