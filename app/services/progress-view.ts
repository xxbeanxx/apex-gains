/**
 * The shapes the history charts render.
 *
 * Deliberately not a `.server` module: the chart components import these
 * types, and everything here is plain data that has already crossed the
 * loader boundary - dates as strings, measurements as numbers already
 * converted into the athlete's units, with the unit carried alongside as a
 * label rather than implied.
 */

export type WeeklyPointView = {
  weekStart: string;
  /** Pre-formatted axis label, e.g. "2 Sep". */
  label: string;
  value: number;
  isCurrentWeek: boolean;
};

export type HeatmapDayView = {
  date: string;
  status: "workout" | "rest" | "none";
  setCount: number;
};

export type MuscleBalanceView = {
  muscleGroup: string;
  setCount: number;
};

export type ProgressSeriesView = {
  exerciseId: string;
  exerciseName: string;
  /** What the number means, e.g. "Est. best set (1RM)". */
  metricLabel: string;
  /** The unit it is expressed in, e.g. "lb", "reps", "min". */
  unit: string;
  points: { date: string; value: number }[];
};

export type PersonalRecordView = {
  exerciseId: string;
  exerciseName: string;
  metricLabel: string;
  unit: string;
  value: number;
  date: string;
};
