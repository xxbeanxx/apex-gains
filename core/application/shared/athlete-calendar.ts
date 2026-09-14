import type { Athlete } from '~domain/athlete/athlete';
import type { Clock } from '~domain/shared/clock';
import { DateOnly } from '~domain/values/date-only';

/**
 * Which calendar day it is for an athlete, and what that rules out.
 *
 * "Today" (see CONTEXT.md) is read off the injected clock in the athlete's
 * own timezone - the day they believe they are training on, not the
 * server's. The one rule hanging off it is that nothing is logged against,
 * or shown for, a later day. A route asks this for today and for the day a
 * page shows; a logging use case asks it for the day a submission lands on,
 * so the rule holds however the date arrived.
 */
export class AthleteCalendar {
  constructor(private readonly clock: Clock) {}

  today(athlete: Athlete): DateOnly {
    return DateOnly.today(this.clock.now(), athlete.preferences.timezone);
  }

  /**
   * The day a set, weigh-in or measurement submitted for `submitted` is
   * logged against: that day, or today if it is later.
   *
   * Clamped rather than refused: a date that is only "tomorrow" because the
   * browser's clock or zone disagrees with the athlete's setting should
   * still log the set, not lose it.
   */
  loggingDay(athlete: Athlete, submitted: DateOnly): DateOnly {
    return submitted.atMost(this.today(athlete));
  }

  /**
   * The day a page asked to show, as typed into a URL: that day, or today
   * when it is missing, not a real day, or later than today.
   */
  viewingDay(athlete: Athlete, requested: string | null | undefined): DateOnly {
    const today = this.today(athlete);
    const parsed = DateOnly.tryParse(requested);
    return parsed?.isOnOrBefore(today) ? parsed : today;
  }
}
