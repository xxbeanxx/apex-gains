/**
 * Locale-dependent date formatting for the UI.
 *
 * Deliberately separate from the calendar arithmetic, which lives on
 * `DateOnly` in the domain layer: this half is presentation, it has to run
 * in the browser, and it depends on the viewer's locale.
 *
 * Everything takes a `YYYY-MM-DD` string, because that is what crosses the
 * loader boundary - domain objects don't serialize.
 */

function toLocalDate(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
}

/** "Tue" - for the week strip. */
export function formatWeekday(dateStr: string): string {
  return toLocalDate(dateStr).toLocaleDateString(undefined, {
    weekday: 'short',
  });
}

/** "2 Sep" - for chart axis labels. */
export function formatMonthDay(dateStr: string): string {
  return toLocalDate(dateStr).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

/** "Tuesday, 2 September" - for page headings and history groups. */
export function formatFullDate(dateStr: string): string {
  return toLocalDate(dateStr).toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

/** "September 2026" - for the history timeline's month dividers. */
export function formatMonthYear(dateStr: string): string {
  const [year, month] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  });
}

/**
 * "Today" / "Yesterday", else the full date. Screen readers announce raw ISO
 * strings a character at a time, so nothing user-facing should show them.
 */
export function formatRelativeDate(dateStr: string, today: string): string {
  if (dateStr === today) return 'Today';

  // Plain string comparison can't tell "one day apart" from "one year
  // apart", so the neighbours are computed rather than compared.
  const asDate = toLocalDate(today);
  const shift = (days: number) => {
    const shifted = new Date(asDate);
    shifted.setDate(shifted.getDate() + days);
    const year = shifted.getFullYear();
    const month = String(shifted.getMonth() + 1).padStart(2, '0');
    const day = String(shifted.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  if (dateStr === shift(-1)) return 'Yesterday';
  if (dateStr === shift(1)) return 'Tomorrow';
  return formatFullDate(dateStr);
}
