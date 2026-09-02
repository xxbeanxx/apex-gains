/**
 * Routine cycles are plain day counts from an anchor date, not calendar
 * weekdays - a 7-slot routine only lines up with weekdays if its anchor
 * happens to fall on the right day. "Today" is the server's local date.
 */

export function todayDateString(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function daysBetweenDateStrings(from: string, to: string): number {
  const fromMs = Date.parse(`${from}T00:00:00Z`);
  const toMs = Date.parse(`${to}T00:00:00Z`);
  return Math.round((toMs - fromMs) / 86_400_000);
}

export function slotIndexForDate(
  anchorDate: string,
  cycleLength: number,
  targetDate: string,
): number {
  if (cycleLength <= 0) {
    throw new Error("cycleLength must be positive");
  }
  const offset = daysBetweenDateStrings(anchorDate, targetDate);
  return ((offset % cycleLength) + cycleLength) % cycleLength;
}
