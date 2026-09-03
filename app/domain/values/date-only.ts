const MS_PER_DAY = 86_400_000;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * A calendar day with no time and no zone - what the `date` columns hold and
 * what routine cycles count in.
 *
 * The arithmetic is done in UTC on the `YYYY-MM-DD` string so that adding a
 * day never lands on a 23- or 25-hour day, while "today" is read from the
 * server's *local* calendar, since that is the day the athlete believes they
 * are training on. That split is deliberate.
 *
 * Display formatting lives in `app/lib/format.ts` instead: it is
 * locale-dependent and runs in the browser, whereas this is pure calendar
 * math.
 */
export class DateOnly {
  private constructor(readonly value: string) {}

  /** Throws on anything that isn't a real `YYYY-MM-DD` day - use for trusted input. */
  static parse(value: string): DateOnly {
    const parsed = DateOnly.tryParse(value);
    if (!parsed) throw new Error(`Invalid date string: ${value}`);
    return parsed;
  }

  /** Returns null instead of throwing - use for anything off a request. */
  static tryParse(value: string | null | undefined): DateOnly | null {
    if (!value || !ISO_DATE.test(value)) return null;

    const parsed = Date.parse(`${value}T00:00:00Z`);
    if (Number.isNaN(parsed)) return null;

    // `Date.parse` rolls impossible days over rather than rejecting them -
    // "2026-02-30" becomes 2 March - so a date that doesn't survive the round
    // trip wasn't a real day. Without this a form could quietly log against a
    // different day than the one it named.
    if (new Date(parsed).toISOString().slice(0, 10) !== value) return null;

    return new DateOnly(value);
  }

  static isValid(value: string): boolean {
    return DateOnly.tryParse(value) !== null;
  }

  /** The server's local calendar day. */
  static today(now: Date = new Date()): DateOnly {
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return new DateOnly(`${year}-${month}-${day}`);
  }

  private get epochMs(): number {
    return Date.parse(`${this.value}T00:00:00Z`);
  }

  plusDays(days: number): DateOnly {
    const shifted = new Date(this.epochMs + days * MS_PER_DAY);
    return new DateOnly(shifted.toISOString().slice(0, 10));
  }

  minusDays(days: number): DateOnly {
    return this.plusDays(-days);
  }

  /** Whole days from this day to `other`; negative if `other` is earlier. */
  daysUntil(other: DateOnly): number {
    return Math.round((other.epochMs - this.epochMs) / MS_PER_DAY);
  }

  /** A `length`-long run of consecutive days starting here. */
  range(length: number): DateOnly[] {
    return Array.from({ length }, (_, i) => this.plusDays(i));
  }

  /** The Monday on or before this day - the week bucket history charts group into. */
  startOfWeek(): DateOnly {
    const dayOfWeek = new Date(this.epochMs).getUTCDay(); // 0 Sun - 6 Sat
    return this.plusDays(dayOfWeek === 0 ? -6 : 1 - dayOfWeek);
  }

  isBefore(other: DateOnly): boolean {
    return this.value < other.value;
  }

  isAfter(other: DateOnly): boolean {
    return this.value > other.value;
  }

  isOnOrBefore(other: DateOnly): boolean {
    return this.value <= other.value;
  }

  isBetween(start: DateOnly, endInclusive: DateOnly): boolean {
    return !this.isBefore(start) && !this.isAfter(endInclusive);
  }

  /** Clamps a date forward-dated past `latest` back onto it. */
  atMost(latest: DateOnly): DateOnly {
    return this.isAfter(latest) ? latest : this;
  }

  equals(other: DateOnly): boolean {
    return this.value === other.value;
  }

  compareTo(other: DateOnly): number {
    return this.value < other.value ? -1 : this.value > other.value ? 1 : 0;
  }

  toString(): string {
    return this.value;
  }

  toJSON(): string {
    return this.value;
  }
}
