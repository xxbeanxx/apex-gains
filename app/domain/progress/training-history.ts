import type { Exercise } from '../exercise/exercise';
import type { LoggedSet } from '../session/logged-set';
import type { WorkoutSession } from '../session/workout-session';
import type { DateOnly } from '../values/date-only';

/**
 * A span of logged sessions together with the exercises they refer to - what
 * every progress calculation reads.
 *
 * Sessions hold only an `exerciseId` per set, but the metrics need the
 * exercise's name, type and muscle group. The join happens once here so
 * each calculation stays a pure function over it.
 */
export class TrainingHistory {
  constructor(
    readonly sessions: readonly WorkoutSession[],
    private readonly exercises: ReadonlyMap<string, Exercise>,
  ) {}

  static of(sessions: readonly WorkoutSession[], exercises: readonly Exercise[]): TrainingHistory {
    return new TrainingHistory(sessions, new Map(exercises.map((exercise) => [exercise.id, exercise])));
  }

  get isEmpty(): boolean {
    return this.sessions.length === 0;
  }

  exerciseFor(exerciseId: string): Exercise | undefined {
    return this.exercises.get(exerciseId);
  }

  sessionOn(date: DateOnly): WorkoutSession | undefined {
    return this.sessions.find((session) => session.date.equals(date));
  }

  /** Every set in the span, paired with the session it belongs to. */
  *entries(): Generator<{ session: WorkoutSession; set: LoggedSet }> {
    for (const session of this.sessions) {
      for (const set of session.sets) {
        yield { session, set };
      }
    }
  }

  within(start: DateOnly, endInclusive: DateOnly): TrainingHistory {
    return new TrainingHistory(
      this.sessions.filter((session) => session.date.isBetween(start, endInclusive)),
      this.exercises,
    );
  }
}
