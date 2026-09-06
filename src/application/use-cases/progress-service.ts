import type { BodyMeasurementsRepository } from '~application/ports/persistence/body-measurements-repository';
import type { BodyWeightRepository } from '~application/ports/persistence/body-weight-repository';
import type { ExercisesRepository } from '~application/ports/persistence/exercises-repository';
import type { PlansRepository } from '~application/ports/persistence/plans-repository';
import type { SessionsRepository } from '~application/ports/persistence/sessions-repository';
import type { WorkoutsRepository } from '~application/ports/persistence/workouts-repository';
import { ExerciseDirectory } from '~application/shared/exercise-directory';
import type {
  HeatmapDayView,
  MuscleBalanceView,
  PersonalRecordView,
  ProgressSeriesView,
  WeeklyPointView,
} from '~application/use-cases/progress-view';
import type { Athlete } from '~domain/athlete/athlete';
import type { AthletePreferences } from '~domain/athlete/preferences';
import type { BodyMeasurement, BodyMeasurementMetric } from '~domain/body/body-measurement';
import type { BodyWeightEntry } from '~domain/body/body-weight-entry';
import { muscleGroupBalance } from '~domain/progress/muscle-balance';
import { type ProgressMetricKind, personalRecords, progressSeries } from '~domain/progress/personal-records';
import { TrainingHistory } from '~domain/progress/training-history';
import { consistencyCalendar, weeklySetCount, weeklyTonnage } from '~domain/progress/weekly-volume';
import type { Session } from '~domain/session/session';
import { DateOnly } from '~domain/values/date-only';
import { Duration } from '~domain/values/duration';
import { Weight } from '~domain/values/weight';
import { formatMonthDay } from '~shared/format';

export type TimelineSet = {
  id: string;
  exerciseId: string;
  exerciseName: string;
  summary: string;
};

export type TimelineDay = {
  id: string;
  date: string;
  isRestDay: boolean;
  /** The workout the session snapshot named, if any - null for a rest day or a plan-less one. */
  workoutName: string | null;
  /** Formatted in the athlete's weight unit; null when nothing weighted was logged. */
  tonnage: string | null;
  sets: TimelineSet[];
};

export type HistoryView = {
  timeline: TimelineDay[];
  totalSets: number;
  workoutCount: number;
  heatmap: HeatmapDayView[];
  weeklySets: WeeklyPointView[];
  weeklyTonnage: WeeklyPointView[];
  tonnageUnit: string;
  exerciseProgress: ProgressSeriesView[];
  personalRecords: PersonalRecordView[];
  muscleBalance: MuscleBalanceView[];
  bodyWeight: ProgressSeriesView | null;
};

/**
 * The signed-in home dashboard's headline numbers, deliberately not a
 * streak - see the marketing page's own "no streak guilt" - plus the same
 * dense rows `/history` renders, for a five-row recent list.
 */
export type DashboardView = {
  sessionsThisWeek: number;
  setsThisWeek: number;
  /** Over the same recent window `/history`'s own totals use, not literally all-time. */
  workoutsLogged: number;
  activePlanName: string | null;
  recentSessions: TimelineDay[];
};

export type BodyWeightEntryView = {
  id: string;
  date: string;
  weight: number;
};

export type BodyWeightView = {
  unit: string;
  entries: BodyWeightEntryView[];
  series: ProgressSeriesView | null;
};

export type BodyMeasurementEntryView = {
  id: string;
  date: string;
  value: number;
};

export type BodyMeasurementView = {
  unit: string;
  entries: BodyMeasurementEntryView[];
  series: ProgressSeriesView | null;
};

const CHART_HISTORY_LIMIT = 250;
const TIMELINE_LIMIT = 90;
const DASHBOARD_RECENT_LIMIT = 5;
const VOLUME_WEEKS = 12;
const HEATMAP_WEEKS = 16;
const MUSCLE_BALANCE_DAYS = 28;
const BODY_WEIGHT_HISTORY_LIMIT = 180;
const BODY_MEASUREMENT_HISTORY_LIMIT = 180;

/** Chart title and table label for a metric - the same on every athlete's page, unlike the unit. */
const BODY_MEASUREMENT_LABELS: Record<BodyMeasurementMetric, string> = {
  waist: 'Waist',
  chest: 'Chest',
  arm_left: 'Left arm',
  arm_right: 'Right arm',
  thigh: 'Thigh',
  hips: 'Hips',
  neck: 'Neck',
};

/**
 * How each exercise's progress metric is labelled and measured.
 *
 * The domain reports a *kind* rather than a unit string, because what a
 * one-rep-max should be shown in depends on the athlete, not on the metric -
 * this is where that is resolved.
 */
function describeMetric(
  kind: ProgressMetricKind,
  preferences: AthletePreferences,
): { metricLabel: string; unit: string; convert: (value: number) => number } {
  switch (kind) {
    case 'one-rep-max':
      return {
        metricLabel: 'Est. best set (1RM)',
        unit: preferences.weightUnit,
        convert: (value) => Weight.lb(value).as(preferences.weightUnit),
      };
    case 'duration':
      return {
        metricLabel: 'Duration',
        unit: 'min',
        convert: (value) => Duration.seconds(value).inMinutes,
      };
    case 'reps':
      return {
        metricLabel: 'Best set',
        unit: 'reps',
        convert: (value) => value,
      };
  }
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Reads training history and turns it into chart-ready data.
 *
 * The calculations themselves - tonnage, estimated 1RM, per-day bests,
 * muscle-group balance - live in `~domain/progress`, where they can be
 * tested without a database. What this adds is loading the span, resolving
 * the exercises behind the sets, and converting canonical measurements into
 * the athlete's units.
 */
export class ProgressService {
  constructor(
    private readonly sessions: SessionsRepository,
    private readonly exercises: ExercisesRepository,
    private readonly workouts: WorkoutsRepository,
    private readonly plans: PlansRepository,
    private readonly bodyWeight: BodyWeightRepository,
    private readonly bodyMeasurements: BodyMeasurementsRepository,
  ) {}

  /**
   * The signed-in home page's read model: this week's headline numbers, the
   * active plan's name, and the same five most recent days `/history` would
   * show first - one call rather than the page reaching into plans,
   * workouts and sessions separately.
   */
  async dashboard(athlete: Athlete): Promise<DashboardView> {
    const today = DateOnly.today(new Date(), athlete.preferences.timezone);
    const weekStart = today.startOfWeek();
    const weekEnd = weekStart.plusDays(6);

    const sessions = await this.sessions.listRecent(athlete.id, CHART_HISTORY_LIMIT);
    const directory = await ExerciseDirectory.of(referencedExerciseIds(sessions), this.exercises);

    const workoutNames = await this.workouts.listNamesFor(athlete.id, athlete.preferences.showSampleData);
    const workoutNameById = new Map(workoutNames.map((workout) => [workout.id, workout.name]));

    const activePlan = await this.plans.findActive(athlete.id);
    const thisWeek = sessions.filter((session) => session.date.isBetween(weekStart, weekEnd));

    return {
      sessionsThisWeek: thisWeek.filter((session) => session.status !== 'none').length,
      setsThisWeek: thisWeek.reduce((sum, session) => sum + session.setCount, 0),
      workoutsLogged: sessions.filter((session) => session.setCount > 0).length,
      activePlanName: activePlan?.name ?? null,
      recentSessions: this.timeline(athlete, sessions.slice(0, DASHBOARD_RECENT_LIMIT), directory, workoutNameById),
    };
  }

  async history(athlete: Athlete, asOf?: DateOnly): Promise<HistoryView> {
    const today = asOf ?? DateOnly.today(new Date(), athlete.preferences.timezone);
    const sessions = await this.sessions.listRecent(athlete.id, CHART_HISTORY_LIMIT);

    // One directory serves both the domain calculations and the timeline's
    // labels; resolving the exercises twice over the same ids would be two
    // round trips for one page.
    const directory = await ExerciseDirectory.of(referencedExerciseIds(sessions), this.exercises);
    const history = TrainingHistory.of(sessions, directory.exercises);
    const preferences = athlete.preferences;

    const workoutNames = await this.workouts.listNamesFor(athlete.id, preferences.showSampleData);
    const workoutNameById = new Map(workoutNames.map((workout) => [workout.id, workout.name]));

    const bodyWeight = await this.bodyWeightSeries(athlete);

    return {
      timeline: this.timeline(athlete, sessions.slice(0, TIMELINE_LIMIT), directory, workoutNameById),
      totalSets: sessions.reduce((sum, s) => sum + s.setCount, 0),
      workoutCount: sessions.filter((s) => s.setCount > 0).length,

      heatmap: consistencyCalendar(history, HEATMAP_WEEKS, today).map((day) => ({
        date: day.date.value,
        status: day.status,
        setCount: day.setCount,
      })),

      weeklySets: weeklySetCount(history, VOLUME_WEEKS, today).map((point) => ({
        weekStart: point.weekStart.value,
        label: formatMonthDay(point.weekStart.value),
        value: point.value,
        isCurrentWeek: point.isCurrentWeek,
      })),

      weeklyTonnage: weeklyTonnage(history, VOLUME_WEEKS, today).map((point) => ({
        weekStart: point.weekStart.value,
        label: formatMonthDay(point.weekStart.value),
        value: round(preferences.weightValue(point.value)),
        isCurrentWeek: point.isCurrentWeek,
      })),
      tonnageUnit: preferences.weightUnit,

      exerciseProgress: progressSeries(history).map((series) => {
        const metric = describeMetric(series.kind, preferences);
        return {
          exerciseId: series.exerciseId,
          exerciseName: series.exerciseName,
          metricLabel: metric.metricLabel,
          unit: metric.unit,
          points: series.points.map((point) => ({
            date: point.date,
            value: round(metric.convert(point.value)),
          })),
        };
      }),

      personalRecords: personalRecords(history).map((record) => {
        const metric = describeMetric(record.kind, preferences);
        return {
          exerciseId: record.exerciseId,
          exerciseName: record.exerciseName,
          metricLabel: metric.metricLabel,
          unit: metric.unit,
          value: round(metric.convert(record.value)),
          date: record.date,
        };
      }),

      muscleBalance: muscleGroupBalance(history, MUSCLE_BALANCE_DAYS, today).map((point) => ({ ...point })),

      bodyWeight,
    };
  }

  async bodyWeightLog(athlete: Athlete): Promise<BodyWeightView> {
    const entries = await this.bodyWeight.listRecent(athlete.id, BODY_WEIGHT_HISTORY_LIMIT);
    const unit = athlete.preferences.weightUnit;

    return {
      unit,
      // Newest first for the table.
      entries: entries.map((entry) => ({
        id: entry.id,
        date: entry.date.value,
        weight: round(entry.weight.as(unit)),
      })),
      series: await this.bodyWeightSeries(athlete, entries),
    };
  }

  /**
   * Body weight rendered as a progress series so it can reuse the exercise
   * trend chart. Needs two points to be a trend, same rule as the exercise
   * series.
   */
  private async bodyWeightSeries(athlete: Athlete, loaded?: readonly BodyWeightEntry[]): Promise<ProgressSeriesView | null> {
    const entries = loaded ?? (await this.bodyWeight.listRecent(athlete.id, BODY_WEIGHT_HISTORY_LIMIT));
    if (entries.length < 2) return null;

    const unit = athlete.preferences.weightUnit;
    return {
      exerciseId: 'body-weight',
      exerciseName: 'Body weight',
      metricLabel: 'Body weight',
      unit,
      // Oldest first for the trend line; the repository returns newest first.
      points: [...entries].reverse().map((entry) => ({
        date: entry.date.value,
        value: round(entry.weight.as(unit)),
      })),
    };
  }

  async bodyMeasurementLog(athlete: Athlete, metric: BodyMeasurementMetric): Promise<BodyMeasurementView> {
    const entries = await this.bodyMeasurements.listRecent(athlete.id, metric, BODY_MEASUREMENT_HISTORY_LIMIT);
    const unit = athlete.preferences.lengthUnit;

    return {
      unit,
      // Newest first for the table.
      entries: entries.map((entry) => ({
        id: entry.id,
        date: entry.date.value,
        value: round(entry.value.as(unit)),
      })),
      series: this.bodyMeasurementSeries(athlete, metric, entries),
    };
  }

  /**
   * A metric rendered as a progress series so it can reuse the exercise
   * trend chart. Needs two points to be a trend, same rule as the exercise
   * series.
   */
  private bodyMeasurementSeries(
    athlete: Athlete,
    metric: BodyMeasurementMetric,
    entries: readonly BodyMeasurement[],
  ): ProgressSeriesView | null {
    if (entries.length < 2) return null;

    const unit = athlete.preferences.lengthUnit;
    const label = BODY_MEASUREMENT_LABELS[metric];
    return {
      exerciseId: `body-${metric}`,
      exerciseName: label,
      metricLabel: label,
      unit,
      // Oldest first for the trend line; the repository returns newest first.
      points: [...entries].reverse().map((entry) => ({
        date: entry.date.value,
        value: round(entry.value.as(unit)),
      })),
    };
  }

  private timeline(
    athlete: Athlete,
    sessions: readonly Session[],
    directory: ExerciseDirectory,
    workoutNameById: Map<string, string>,
  ): TimelineDay[] {
    return sessions.map((session) => ({
      id: session.id,
      date: session.date.value,
      isRestDay: session.isRestDay,
      workoutName: session.plan.workoutId ? (workoutNameById.get(session.plan.workoutId) ?? 'Unknown') : null,
      tonnage: session.tonnage.inPounds > 0 ? athlete.preferences.formatWeight(session.tonnage) : null,
      sets: session.sets.map((set) => ({
        id: set.id,
        exerciseId: set.exerciseId,
        exerciseName: directory.nameOf(set.exerciseId),
        summary: set.format(athlete.preferences),
      })),
    }));
  }
}

function referencedExerciseIds(sessions: readonly Session[]): string[] {
  return sessions.flatMap((session) => session.sets.map((set) => set.exerciseId));
}
