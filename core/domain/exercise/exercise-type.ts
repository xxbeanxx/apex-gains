/**
 * Whether an exercise is lifted or done on a machine. The split decides
 * which measurements a set carries: reps and weight for strength, duration
 * plus speed or resistance for cardio - which of the latter two applies is
 * `cardioFieldsFor` in ../equipment/cardio-fields.ts, since it depends on
 * the equipment rather than on the type.
 */

export const EXERCISE_TYPES = ['strength', 'cardio'] as const;

export type ExerciseType = (typeof EXERCISE_TYPES)[number];
