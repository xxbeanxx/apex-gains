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

export function addDays(dateStr: string, delta: number): string {
  const ms = Date.parse(`${dateStr}T00:00:00Z`) + delta * 86_400_000;
  return new Date(ms).toISOString().slice(0, 10);
}

export function formatWeekday(dateStr: string): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    weekday: "short",
  });
}

export function formatMonthDay(dateStr: string): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function toLocalDate(dateStr: string): Date {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(year, month - 1, day);
}

/** "Tuesday, 2 September" - for page headings and history groups. */
export function formatFullDate(dateStr: string): string {
  return toLocalDate(dateStr).toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

/**
 * "Today" / "Yesterday", else the full date. Screen readers announce raw ISO
 * strings a character at a time, so nothing user-facing should show them.
 */
export function formatRelativeDate(
  dateStr: string,
  today: string = todayDateString(),
): string {
  const delta = daysBetweenDateStrings(dateStr, today);
  if (delta === 0) return "Today";
  if (delta === 1) return "Yesterday";
  if (delta === -1) return "Tomorrow";
  return formatFullDate(dateStr);
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
