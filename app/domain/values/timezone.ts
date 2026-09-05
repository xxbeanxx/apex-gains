/**
 * The timezones an athlete can choose in /settings, and what a fresh
 * account starts with.
 *
 * `Intl.supportedValuesOf` is the runtime's own IANA database, so this list
 * needs no maintenance as zones are added or renamed - the single source
 * the `WEIGHT_UNITS`/`DISTANCE_UNITS` tuples are for a fixed handful of
 * options doesn't apply here, since there are hundreds of zones and the
 * platform already knows all of them.
 */

export const DEFAULT_TIMEZONE = 'UTC';

// `Intl.supportedValuesOf('timeZone')` enumerates IANA-named zones, but
// 'UTC' is a spec-level identifier `Intl.DateTimeFormat` always accepts
// rather than an IANA zone - some ICU builds omit it from the list even
// though it's a valid, and here the default, timezone. Adding it back
// explicitly keeps the default always selectable regardless of ICU build.
const supported = Intl.supportedValuesOf('timeZone');
export const TIMEZONES: readonly string[] = supported.includes(DEFAULT_TIMEZONE) ? supported : [DEFAULT_TIMEZONE, ...supported];

export function isValidTimezone(value: string): boolean {
  return TIMEZONES.includes(value);
}
