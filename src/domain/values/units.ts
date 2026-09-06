/**
 * The units an athlete can choose in /settings.
 *
 * The tuples are the single source: the types derive from them, and the Zod
 * schemas that parse the settings form use them directly, so adding a unit
 * is one edit rather than three that can drift apart. They mirror the
 * `weight_unit` / `distance_unit` Postgres enums, but the schema's enum is a
 * storage detail - the domain deals in these.
 */

export const WEIGHT_UNITS = ['lb', 'kg'] as const;
export const DISTANCE_UNITS = ['km', 'mi'] as const;
export const LENGTH_UNITS = ['cm', 'in'] as const;

export type WeightUnit = (typeof WEIGHT_UNITS)[number];
export type DistanceUnit = (typeof DISTANCE_UNITS)[number];
/** Body measurements (waist, chest, ...) - not `DistanceUnit`, which is km/mi for treadmill speed and nonsense for a waist. */
export type LengthUnit = (typeof LENGTH_UNITS)[number];

/**
 * Speed is expressed per hour of the athlete's distance unit, so the label
 * doesn't follow the "km"/"mi" spelling: nobody writes "mi/h".
 */
export function speedUnitLabel(unit: DistanceUnit): string {
  return unit === 'km' ? 'km/h' : 'mph';
}

/**
 * Trims a converted value to at most `maxDecimals` places and drops trailing
 * zeros, so a clean number reads as "135" rather than "135.0" while a
 * converted one keeps enough precision to be useful ("61.2").
 */
export function formatNumber(value: number, maxDecimals = 1): string {
  const rounded = Number(value.toFixed(maxDecimals));
  return String(rounded);
}
