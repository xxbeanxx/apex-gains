import { Inject, Injectable } from '@nestjs/common';

import type { Athlete } from '~/domain/athlete/athlete';
import type { AthletePreferences } from '~/domain/athlete/preferences';
import type { BodyWeightEntry } from '~/domain/bodyweight/body-weight-entry';
import { muscleGroupBalance } from '~/domain/progress/muscle-balance';
import { personalRecords, progressSeries, type ProgressMetricKind } from '~/domain/progress/personal-records';
import { TrainingHistory } from '~/domain/progress/training-history';
import { consistencyCalendar, weeklySetCount, weeklyTonnage } from '~/domain/progress/weekly-volume';
import type { WorkoutSession } from '~/domain/session/workout-session';
import { DateOnly } from '~/domain/values/date-only';
import { Duration } from '~/domain/values/duration';
import { Weight } from '~/domain/values/weight';
import { formatMonthDay } from '~/lib/format';
import type { BodyWeightRepository } from '~/repositories/body-weight-repository.server';
import type { ExercisesRepository } from '~/repositories/exercises-repository.server';
import type { WorkoutSessionsRepository } from '~/repositories/workout-sessions-repository.server';
import { BODY_WEIGHT_REPOSITORY, EXERCISES_REPOSITORY, WORKOUT_SESSIONS_REPOSITORY } from '~/repositories/tokens';

import { ExerciseDirectory } from './shared/exercise-directory.server';

import type {
  HeatmapDayView,
  MuscleBalanceView,
  PersonalRecordView,
  ProgressSeriesView,
  WeeklyPointView,
} from './progress-view';

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

const CHART_HISTORY_LIMIT = 250;
const TIMELINE_LIMIT = 90;
const VOLUME_WEEKS = 12;
const HEATMAP_WEEKS = 16;
const MUSCLE_BALANCE_DAYS = 28;
const BODY_WEIGHT_HISTORY_LIMIT = 180;

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
 * muscle-group balance - live in `~/domain/progress`, where they can be
 * tested without a database. What this adds is loading the span, resolving
 * the exercises behind the sets, and converting canonical measurements into
 * the athlete's units.
 */
@Injectable()
export class ProgressService {
  constructor(
    @Inject(WORKOUT_SESSIONS_REPOSITORY)
    private readonly sessions: WorkoutSessionsRepository,
    @Inject(EXERCISES_REPOSITORY) private readonly exercises: ExercisesRepository,
    @Inject(BODY_WEIGHT_REPOSITORY)
    private readonly bodyWeight: BodyWeightRepository,
  ) {}

  async history(athlete: Athlete, asOf?: DateOnly): Promise<HistoryView> {
    const today = asOf ?? DateOnly.today(new Date(), athlete.preferences.timezone);
    const sessions = await this.sessions.listRecent(athlete.id, CHART_HISTORY_LIMIT);

    // One directory serves both the domain calculations and the timeline's
    // labels; resolving the exercises twice over the same ids would be two
    // round trips for one page.
    const directory = await ExerciseDirectory.of(referencedExerciseIds(sessions), this.exercises);
    const history = TrainingHistory.of(sessions, directory.exercises);
    const preferences = athlete.preferences;

    const bodyWeight = await this.bodyWeightSeries(athlete);

    return {
      timeline: this.timeline(athlete, sessions.slice(0, TIMELINE_LIMIT), directory),
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

  private timeline(athlete: Athlete, sessions: readonly WorkoutSession[], directory: ExerciseDirectory): TimelineDay[] {
    return sessions.map((session) => ({
      id: session.id,
      date: session.date.value,
      isRestDay: session.isRestDay,
      sets: session.sets.map((set) => ({
        id: set.id,
        exerciseId: set.exerciseId,
        exerciseName: directory.nameOf(set.exerciseId),
        summary: set.format(athlete.preferences),
      })),
    }));
  }
}

function referencedExerciseIds(sessions: readonly WorkoutSession[]): string[] {
  return sessions.flatMap((session) => session.sets.map((set) => set.exerciseId));
}
