import type { CardioKind } from '~domain/equipment/equipment';

/**
 * Which of the two cardio measurements a form should offer.
 *
 * Read models carry this rather than the raw list of kinds, so the answer is
 * decided once here instead of being re-derived by each form that renders
 * one.
 */
export type CardioFields = {
  readonly showSpeed: boolean;
  readonly showResistance: boolean;
};

/**
 * Which cardio fields make sense for an exercise, from its linked
 * equipment's `cardioKind`. An exercise whose equipment is unanimous about
 * reporting only speed or only resistance hides the field that doesn't
 * apply; anything else - no equipment set a kind, equipment disagrees, or
 * an exercise links more than one kind - shows both rather than guessing
 * wrong and hiding a field a set actually needs.
 */
export function cardioFieldsFor(equipmentCardioKinds: readonly (CardioKind | null)[]): CardioFields {
  const kinds = new Set(equipmentCardioKinds.filter((kind): kind is CardioKind => kind !== null));

  if (kinds.size === 1 && kinds.has('speed')) return { showSpeed: true, showResistance: false };
  if (kinds.size === 1 && kinds.has('resistance')) return { showSpeed: false, showResistance: true };
  return { showSpeed: true, showResistance: true };
}
