import type { CardioFields } from '../equipment/cardio-fields';
import type { ExerciseType } from '../exercise/exercise-type';
import type { LoggedSet } from '../session/logged-set';
import type { DateOnly } from '../values/date-only';
import { Duration } from '../values/duration';
import { Speed } from '../values/speed';
import type { Weight } from '../values/weight';
import { SetTarget } from '../workout/set-target';

const SPEED_INCREMENT = Speed.kmh(0.5);
const DURATION_INCREMENT = Duration.seconds(60);

export type SuggestionKind = 'increase-weight' | 'increase-reps' | 'increase-duration' | 'increase-speed' | 'hold';

export type Suggestion = {
  readonly kind: SuggestionKind;
  readonly target: SetTarget;
  /** Unit-free - "you hit 3 x 10 twice" - the caller formats the target itself. */
  readonly because: string;
};

/** One exercise's sets on one day it was trained. */
export type RecentSession = {
  readonly date: DateOnly;
  readonly sets: readonly LoggedSet[];
};

/**
 * Double progression for fixed-resistance strength equipment, and a
 * matching duration/speed nudge for cardio.
 *
 * `recent` is ordered most-recent-first; only the newest two entries are
 * ever consulted, so a caller may pass more without changing the answer.
 * Never suggests from fewer than two sessions - a single good day is noise,
 * and a suggestion built on it teaches people to distrust the feature. Never
 * applies itself: the caller always renders this as a proposal with a
 * reason, which a tap accepts.
 *
 * `weightIncrement` is supplied rather than computed here because its size
 * is a decision about the athlete's own unit (5 lb or 2.5 kg - a PR1000's
 * power rods come in discrete steps, not a percentage), which only the
 * caller knows.
 */
export function suggestNextTarget(
  current: SetTarget,
  recent: readonly RecentSession[],
  exerciseType: ExerciseType,
  cardioFields: CardioFields,
  weightIncrement: Weight,
): Suggestion | null {
  if (recent.length < 2) return null;

  return exerciseType === 'cardio'
    ? suggestCardio(current, recent, cardioFields)
    : suggestStrength(current, recent, weightIncrement);
}

function currentInput(current: SetTarget) {
  return {
    sets: current.sets,
    reps: current.reps,
    weight: current.weight,
    duration: current.duration,
    speed: current.speed,
    resistance: current.resistance,
    rest: current.rest,
  };
}

/**
 * A session "hits" the target when at least `targetSets` of its logged sets
 * each reached both the target reps and the target weight - "met or beat
 * sets x reps at the current weight".
 */
function hitsStrengthTarget(logged: readonly LoggedSet[], targetSets: number, targetReps: number, weight: Weight): boolean {
  const qualifying = logged.filter(
    (set) => set.weight !== null && set.reps !== null && set.weight.inPounds >= weight.inPounds && set.reps >= targetReps,
  );
  return qualifying.length >= targetSets;
}

/** At least `targetSets` sets were logged at (or above) the target weight, regardless of reps. */
function metSetCountAtWeight(logged: readonly LoggedSet[], targetSets: number, weight: Weight): boolean {
  const atWeight = logged.filter((set) => set.weight !== null && set.weight.inPounds >= weight.inPounds);
  return atWeight.length >= targetSets;
}

function suggestStrength(current: SetTarget, recent: readonly RecentSession[], increment: Weight): Suggestion | null {
  const { sets, reps, weight } = current;
  if (sets === null || reps === null || weight === null) return null;

  const [latest, previous] = recent;

  if (hitsStrengthTarget(latest.sets, sets, reps, weight) && hitsStrengthTarget(previous.sets, sets, reps, weight)) {
    return {
      kind: 'increase-weight',
      target: SetTarget.of({ ...currentInput(current), weight: weight.plus(increment) }),
      because: `you hit ${sets} x ${reps} twice`,
    };
  }

  if (metSetCountAtWeight(latest.sets, sets, weight)) {
    return {
      kind: 'increase-reps',
      target: SetTarget.of({ ...currentInput(current), reps: reps + 1 }),
      because: `you hit ${sets} sets at this weight`,
    };
  }

  return {
    kind: 'hold',
    target: current,
    because: `working towards ${sets} x ${reps}`,
  };
}

function hitsCardioTarget(logged: readonly LoggedSet[], duration: Duration, speed: Speed | null): boolean {
  return logged.some((set) => {
    if (set.duration === null || set.duration.inSeconds < duration.inSeconds) return false;
    if (speed === null) return true;
    return set.speed !== null && set.speed.inKmPerHour >= speed.inKmPerHour;
  });
}

function suggestCardio(current: SetTarget, recent: readonly RecentSession[], cardioFields: CardioFields): Suggestion | null {
  const { duration } = current;
  if (duration === null) return null;

  // Only compare against speed when the equipment reports one - resistance
  // has no established increment convention, so a resistance-only exercise
  // (rowing) still progresses by duration alone.
  const speed = cardioFields.showSpeed ? current.speed : null;

  const [latest, previous] = recent;
  if (!(hitsCardioTarget(latest.sets, duration, speed) && hitsCardioTarget(previous.sets, duration, speed))) {
    return {
      kind: 'hold',
      target: current,
      because: `working towards ${duration.format()}`,
    };
  }

  if (speed !== null) {
    return {
      kind: 'increase-speed',
      target: SetTarget.of({ ...currentInput(current), speed: Speed.kmh(speed.inKmPerHour + SPEED_INCREMENT.inKmPerHour) }),
      because: 'you hit it twice',
    };
  }

  return {
    kind: 'increase-duration',
    target: SetTarget.of({
      ...currentInput(current),
      duration: Duration.seconds(duration.inSeconds + DURATION_INCREMENT.inSeconds),
    }),
    because: 'you hit it twice',
  };
}
