import { describe, expect, it } from 'vitest';
import { AthleteCalendar } from '~application/shared/athlete-calendar';
import { Athlete } from '~domain/athlete/athlete';
import { fixedClock } from '~domain/shared/clock';
import { DateOnly } from '~domain/values/date-only';

// 01:30 UTC on 4 September is still 3 September, 23:00, in St. John's
// (UTC-2:30 in September) - the case that goes wrong if "today" is read in
// the server's zone rather than the athlete's.
const NOW = new Date('2026-09-04T01:30:00Z');
const calendar = new AthleteCalendar(fixedClock(NOW));

function athleteIn(timezone: string): Athlete {
  return Athlete.fromSnapshot({
    id: 'user-1',
    googleSub: 'google-1',
    email: 'athlete@example.com',
    name: 'Athlete',
    avatarUrl: null,
    weightUnit: 'lb',
    distanceUnit: 'km',
    lengthUnit: 'in',
    showSampleData: true,
    defaultRestSeconds: null,
    timezone,
    isAdmin: false,
    createdAt: NOW,
    updatedAt: NOW,
  });
}

const stJohns = athleteIn('America/St_Johns');
const utc = athleteIn('UTC');

describe('today', () => {
  it("reads the clock in the athlete's own timezone", () => {
    expect(calendar.today(stJohns).value).toBe('2026-09-03');
    expect(calendar.today(utc).value).toBe('2026-09-04');
  });
});

describe('loggingDay', () => {
  it('keeps today and any earlier day', () => {
    expect(calendar.loggingDay(stJohns, DateOnly.parse('2026-09-03')).value).toBe('2026-09-03');
    expect(calendar.loggingDay(stJohns, DateOnly.parse('2026-08-01')).value).toBe('2026-08-01');
  });

  it("pulls a later day back to the athlete's today", () => {
    // The UTC athlete's today, which is still tomorrow in St. John's.
    expect(calendar.loggingDay(stJohns, DateOnly.parse('2026-09-04')).value).toBe('2026-09-03');
    expect(calendar.loggingDay(utc, DateOnly.parse('2026-09-04')).value).toBe('2026-09-04');
  });
});

describe('viewingDay', () => {
  it('shows a requested day on or before today', () => {
    expect(calendar.viewingDay(stJohns, '2026-09-03').value).toBe('2026-09-03');
    expect(calendar.viewingDay(stJohns, '2026-08-30').value).toBe('2026-08-30');
  });

  it('falls back to today for a later, missing, or unreal day', () => {
    expect(calendar.viewingDay(stJohns, '2026-09-04').value).toBe('2026-09-03');
    expect(calendar.viewingDay(stJohns, null).value).toBe('2026-09-03');
    expect(calendar.viewingDay(stJohns, undefined).value).toBe('2026-09-03');
    expect(calendar.viewingDay(stJohns, '2026-02-30').value).toBe('2026-09-03');
    expect(calendar.viewingDay(stJohns, 'yesterday').value).toBe('2026-09-03');
  });
});
