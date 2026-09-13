import type { BodyWeightRepository } from '~application/ports/persistence/body-weight-repository';
import type { ExercisesRepository } from '~application/ports/persistence/exercises-repository';
import type { PlansRepository } from '~application/ports/persistence/plans-repository';
import type { SessionsRepository } from '~application/ports/persistence/sessions-repository';
import type { WorkoutsRepository } from '~application/ports/persistence/workouts-repository';
import type { ReferenceDirectory } from '~application/shared/reference-directory';
import type { Athlete } from '~domain/athlete/athlete';
import type { Exercise } from '~domain/exercise/exercise';
import type { Clock } from '~domain/shared/clock';
import type { SetTarget } from '~domain/workout/set-target';
import type { Workout } from '~domain/workout/workout';

/**
 * Everything an athlete owns, in one snapshot - the complete JSON export.
 *
 * Every id in it resolves inside the file: alongside their own exercises
 * and workouts it carries each sample one their data names (marked
 * `isSample`), since a set logged against a sample or a plan built from
 * one would otherwise point at nothing the reader has.
 *
 * Every measurement is canonical (pounds, km/h, seconds), never the
 * athlete's display unit: an export is data, not a rendering, and
 * converting it on the way out would make two exports of the same training
 * incomparable just because a setting changed in between. `athlete.units`
 * records the preference that was in effect, for a reader who wants to
 * reconstruct the display.
 */
export type ExportSnapshot = {
  exportedAt: string;
  athlete: {
    id: string;
    name: string;
    email: string;
    units: { weight: string; distance: string };
    timezone: string;
  };
  exercises: ExportExercise[];
  workouts: ExportWorkout[];
  plans: ExportPlan[];
  sessions: ExportSession[];
  bodyWeight: ExportBodyWeightEntry[];
};

export type ExportExercise = {
  id: string;
  isSample: boolean;
  name: string;
  exerciseType: string;
  muscleGroup: string | null;
  description: string | null;
};

export type ExportTarget = {
  sets: number | null;
  reps: number | null;
  weightLb: number | null;
  durationSeconds: number | null;
  speedKmh: number | null;
  resistance: number | null;
  restSeconds: number | null;
};

export type ExportWorkout = {
  id: string;
  isSample: boolean;
  name: string;
  exercises: (ExportTarget & { exerciseId: string; position: number })[];
};

export type ExportPlan = {
  id: string;
  name: string;
  isActive: boolean;
  anchorDate: string;
  slots: { position: number; workoutId: string | null; isRestDay: boolean }[];
};

export type ExportSet = {
  exerciseId: string;
  setNumber: number;
  reps: number | null;
  weightLb: number | null;
  durationSeconds: number | null;
  speedKmh: number | null;
  resistanceLevel: number | null;
  rpe: number | null;
  notes: string | null;
};

export type ExportSession = {
  date: string;
  isRestDay: boolean;
  sets: ExportSet[];
};

export type ExportBodyWeightEntry = {
  date: string;
  weightLb: number;
};

const CSV_COLUMNS = [
  'date',
  'exercise_name',
  'set_number',
  'reps',
  'weight_lb',
  'duration_seconds',
  'speed_kmh',
  'resistance_level',
  'rpe',
  'notes',
] as const;

/**
 * RFC 4180: a field touching a comma, quote or newline is quoted, with embedded quotes doubled.
 */
function csvField(value: string | number | null): string {
  if (value === null) return '';
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/**
 * An athlete's own data, out. Spans exercises, workouts, plans, sessions and
 * body weight, so it belongs to none of the existing services - each of
 * those owns one slice of the library or the log, not the whole of it.
 *
 * Building the whole export in memory (both formats read every row before
 * writing anything) is fine only because the volume is bounded by one
 * person's training history - it is the kind of assumption that stops being
 * true quietly, so it is worth stating rather than leaving implicit.
 */
export class ExportService {
  constructor(
    private readonly exercises: ExercisesRepository,
    private readonly workouts: WorkoutsRepository,
    private readonly references: ReferenceDirectory,
    private readonly plans: PlansRepository,
    private readonly sessions: SessionsRepository,
    private readonly bodyWeight: BodyWeightRepository,
    private readonly clock: Clock,
  ) {}

  async snapshot(athlete: Athlete): Promise<ExportSnapshot> {
    const [ownExercises, ownWorkouts, plans, sessions, bodyWeight] = await Promise.all([
      this.exercises.listFor(athlete.id, false),
      this.workouts.listFor(athlete.id, false),
      this.plans.listFor(athlete.id, false),
      this.sessions.listAll(athlete.id),
      this.bodyWeight.listAll(athlete.id),
    ]);

    // Workouts first: a sample workout a plan names brings its own entries'
    // exercises with it.
    const workouts = await this.withReferenced(
      ownWorkouts,
      plans.flatMap((plan) => plan.slots.flatMap((slot) => (slot.workoutId ? [slot.workoutId] : []))),
      async (ids) => {
        const resolved = await this.references.historical({ workoutIds: ids });
        return ids.flatMap((id) => resolved.workout(id) ?? []);
      },
    );
    const exercises = await this.withReferenced(
      ownExercises,
      [
        ...workouts.flatMap((workout) => workout.exercises.map((entry) => entry.exerciseId)),
        ...sessions.flatMap((session) => session.sets.map((set) => set.exerciseId)),
      ],
      async (ids) => (await this.references.historical({ exerciseIds: ids })).exercises,
    );

    return {
      exportedAt: this.clock.now().toISOString(),
      athlete: {
        id: athlete.id,
        name: athlete.name,
        email: athlete.email,
        units: { weight: athlete.preferences.weightUnit, distance: athlete.preferences.distanceUnit },
        timezone: athlete.preferences.timezone,
      },
      exercises: exercises.map((exercise) => ({
        id: exercise.id,
        isSample: exercise.ownership.isSample,
        name: exercise.name,
        exerciseType: exercise.exerciseType,
        muscleGroup: exercise.muscleGroup,
        description: exercise.description,
      })),
      workouts: workouts.map((workout) => ({
        id: workout.id,
        isSample: workout.ownership.isSample,
        name: workout.name,
        exercises: workout.exercises.map((entry) => ({
          exerciseId: entry.exerciseId,
          position: entry.position,
          ...targetOf(entry.target),
        })),
      })),
      plans: plans.map((plan) => ({
        id: plan.id,
        name: plan.name,
        isActive: plan.isActive,
        anchorDate: plan.anchorDate.value,
        slots: plan.slots.map((slot) => ({ position: slot.position, workoutId: slot.workoutId, isRestDay: slot.isRestDay })),
      })),
      sessions: sessions.map((session) => ({
        date: session.date.value,
        isRestDay: session.isRestDay,
        sets: session.sets.map((set) => ({
          exerciseId: set.exerciseId,
          setNumber: set.setNumber,
          reps: set.reps,
          weightLb: set.weight?.inPounds ?? null,
          durationSeconds: set.duration?.inSeconds ?? null,
          speedKmh: set.speed?.inKmPerHour ?? null,
          resistanceLevel: set.resistanceLevel,
          rpe: set.rpe?.value ?? null,
          notes: set.notes,
        })),
      })),
      bodyWeight: bodyWeight.map((entry) => ({ date: entry.date.value, weightLb: entry.weight.inPounds })),
    };
  }

  /**
   * Logged sets only - what actually gets opened in a spreadsheet. The
   * exercise's own name is joined in per row, since that is what a person
   * reading a CSV wants, not an id they'd have to cross-reference.
   */
  async toCsv(athlete: Athlete): Promise<string> {
    const sessions = await this.sessions.listAll(athlete.id);
    const references = await this.references.historical({
      exerciseIds: sessions.flatMap((session) => session.sets.map((set) => set.exerciseId)),
    });

    const rows: string[] = [CSV_COLUMNS.join(',')];
    for (const session of sessions) {
      for (const set of session.sets) {
        rows.push(
          [
            session.date.value,
            references.exercise(set.exerciseId).name,
            set.setNumber,
            set.reps,
            set.weight?.inPounds ?? null,
            set.duration?.inSeconds ?? null,
            set.speed?.inKmPerHour ?? null,
            set.resistanceLevel,
            set.rpe?.value ?? null,
            set.notes,
          ]
            .map(csvField)
            .join(','),
        );
      }
    }

    return rows.join('\n');
  }

  /**
   * `own` followed by whatever `referencedIds` names that `own` doesn't hold
   * - which, since an athlete's data only ever names their own rows or
   * samples, is the samples.
   */
  private async withReferenced<T extends Exercise | Workout>(
    own: T[],
    referencedIds: string[],
    resolve: (ids: string[]) => Promise<T[]>,
  ): Promise<T[]> {
    const ownIds = new Set(own.map((row) => row.id));
    const missing = [...new Set(referencedIds)].filter((id) => !ownIds.has(id));
    return missing.length === 0 ? own : [...own, ...(await resolve(missing))];
  }
}

function targetOf(target: SetTarget): ExportTarget {
  return {
    sets: target.sets,
    reps: target.reps,
    weightLb: target.weight?.inPounds ?? null,
    durationSeconds: target.duration?.inSeconds ?? null,
    speedKmh: target.speed?.inKmPerHour ?? null,
    resistance: target.resistance,
    restSeconds: target.rest?.inSeconds ?? null,
  };
}
