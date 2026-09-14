/**
 * The muscle an exercise primarily targets, or null for one that does not
 * isolate a single group (a cardio machine's walk/run/row).
 */

export const MUSCLE_GROUPS = [
  'Chest',
  'Back',
  'Traps',
  'Shoulders',
  'Biceps',
  'Triceps',
  'Forearms',
  'Core',
  'Quadriceps',
  'Hamstrings',
  'Glutes',
  'Calves',
  'Full Body',
] as const;

export type MuscleGroup = (typeof MUSCLE_GROUPS)[number];
