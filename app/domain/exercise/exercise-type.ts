/**
 * Strength and cardio work are logged with different measurements, and until
 * now that split was re-asserted independently in the log form's JSX, in the
 * Zod schemas that parse it, and in each display helper that formatted a
 * set. Stating it once means a set can be validated against the exercise it
 * belongs to instead of against whatever the form happened to send.
 */

export const EXERCISE_TYPES = ["strength", "cardio"] as const;

export type ExerciseType = (typeof EXERCISE_TYPES)[number];

/** Which measurements a set of this kind of work can carry. */
export type Metrics = {
  readonly reps: boolean;
  readonly weight: boolean;
  readonly duration: boolean;
  readonly speed: boolean;
  readonly resistance: boolean;
};

const STRENGTH_METRICS: Metrics = {
  reps: true,
  weight: true,
  duration: false,
  speed: false,
  resistance: false,
};

// Cardio covers both machines: the treadmill records duration and speed, the
// rower duration and resistance. Neither records distance or pace - see
// CLAUDE.md's note that neither is reliably derivable from what's tracked.
const CARDIO_METRICS: Metrics = {
  reps: false,
  weight: false,
  duration: true,
  speed: true,
  resistance: true,
};

export function metricsFor(type: ExerciseType): Metrics {
  return type === "strength" ? STRENGTH_METRICS : CARDIO_METRICS;
}
