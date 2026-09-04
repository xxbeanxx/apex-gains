import { Inject, Injectable } from '@nestjs/common';

import type { Athlete } from '~/domain/athlete/athlete';
import type { ExerciseType } from '~/domain/exercise/exercise-type';
import type { MoveDirection } from '~/domain/shared/ordered';
import { err, ok, type Result } from '~/domain/shared/result';
import { SetTarget } from '~/domain/template/set-target';
import { WorkoutTemplate } from '~/domain/template/workout-template';
import { Duration } from '~/domain/values/duration';
import { Speed } from '~/domain/values/speed';
import { Weight } from '~/domain/values/weight';
import type { ExercisesRepository } from '~/repositories/exercises-repository.server';
import type { TemplatesRepository } from '~/repositories/templates-repository.server';
import type { UnitOfWork } from '~/repositories/unit-of-work.server';
import { EXERCISES_REPOSITORY, TEMPLATES_REPOSITORY, UNIT_OF_WORK } from '~/repositories/tokens';
import { DOMAIN_DEPS } from '~/services/shared/tokens';

import type { DomainDeps } from './shared/deps.server';
import { resolveEditableCopy } from './shared/fork.server';

export type TemplateSummary = {
  id: string;
  name: string;
  isSample: boolean;
  /** A personal copy of a sample - shown as "Customized" rather than "Sample". */
  isCustomized: boolean;
  exerciseCount: number;
};

export type TemplateExerciseView = {
  id: string;
  position: number;
  exerciseId: string;
  exerciseName: string;
  exerciseType: ExerciseType;
  /** Already formatted in the athlete's units; null when nothing is targeted. */
  targetSummary: string | null;
};

export type TemplateDetail = TemplateSummary & {
  canRevert: boolean;
  isDeletable: boolean;
  exercises: TemplateExerciseView[];
};

/**
 * Targets as the athlete typed them: weight in their weight unit, speed in
 * their distance unit, duration in minutes. Converting to the canonical
 * storage units is this service's job, not the form's.
 */
export type TargetInput = {
  sets?: number | null;
  reps?: number | null;
  weight?: number | null;
  durationMinutes?: number | null;
  speed?: number | null;
  resistance?: number | null;
};

export type TemplateMutation = Result<{ forkedId: string | null }, 'not-found'>;

function toSummary(template: WorkoutTemplate): TemplateSummary {
  return {
    id: template.id,
    name: template.name,
    isSample: template.ownership.isSample,
    isCustomized: template.canRevert,
    exerciseCount: template.exerciseCount,
  };
}

/** Use cases for building the reusable workouts a routine schedules. */
@Injectable()
export class TemplateService {
  constructor(
    @Inject(TEMPLATES_REPOSITORY) private readonly templates: TemplatesRepository,
    @Inject(EXERCISES_REPOSITORY) private readonly exercises: ExercisesRepository,
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: UnitOfWork,
    @Inject(DOMAIN_DEPS) private readonly deps: DomainDeps,
  ) {}

  async list(athlete: Athlete): Promise<TemplateSummary[]> {
    const templates = await this.templates.listFor(athlete.id, athlete.preferences.showSampleData);
    return templates.map(toSummary);
  }

  /** Sorted by name - what the routine editor's template picker offers. */
  async listForPicker(athlete: Athlete): Promise<TemplateSummary[]> {
    return (await this.list(athlete)).sort((a, b) => a.name.localeCompare(b.name));
  }

  async detail(athlete: Athlete, templateId: string): Promise<TemplateDetail | null> {
    const template = await this.templates.findVisible(athlete.id, templateId);
    if (!template) return null;

    // By id rather than by the athlete's library: an entry can point at a
    // sample they have since forked away from, which their library hides.
    const exercises = await this.exercises.findManyByIds(template.exercises.map((entry) => entry.exerciseId));
    const byId = new Map(exercises.map((exercise) => [exercise.id, exercise]));

    return {
      ...toSummary(template),
      canRevert: template.canRevert,
      isDeletable: template.isDeletable,
      exercises: template.exercises.map((entry) => {
        const exercise = byId.get(entry.exerciseId);
        return {
          id: entry.id,
          position: entry.position,
          exerciseId: entry.exerciseId,
          exerciseName: exercise?.name ?? 'Unknown',
          exerciseType: exercise?.exerciseType ?? 'strength',
          targetSummary: entry.target.format(athlete.preferences),
        };
      }),
    };
  }

  async create(athlete: Athlete, name: string): Promise<TemplateSummary> {
    const template = WorkoutTemplate.create(athlete.id, name, this.deps);
    await this.unitOfWork.run(() => this.templates.save(template));
    return toSummary(template);
  }

  async rename(athlete: Athlete, templateId: string, name: string): Promise<TemplateMutation> {
    return this.mutate(athlete, templateId, (template) => template.rename(name, this.deps.clock.now()));
  }

  async addExercise(
    athlete: Athlete,
    templateId: string,
    exerciseId: string,
    input: TargetInput,
  ): Promise<Result<{ forkedId: string | null }, 'not-found' | 'exercise-not-found'>> {
    return this.unitOfWork.run(async () => {
      const loaded = await this.templates.findVisible(athlete.id, templateId);
      if (!loaded) return err('not-found' as const);

      const exercise = await this.exercises.findVisible(athlete.id, exerciseId);
      if (!exercise) return err('exercise-not-found' as const);

      const copy = await this.editableCopy(loaded, athlete);
      copy.editable.addExercise(exerciseId, this.toTarget(athlete, input), this.deps);
      await this.templates.save(copy.editable);

      return ok({ forkedId: copy.forkedId });
    });
  }

  async removeExercise(athlete: Athlete, templateId: string, entryId: string): Promise<TemplateMutation> {
    return this.mutate(athlete, templateId, (template, translate) =>
      template.removeExercise(translate(entryId), this.deps.clock.now()),
    );
  }

  async moveExercise(
    athlete: Athlete,
    templateId: string,
    entryId: string,
    direction: MoveDirection,
  ): Promise<TemplateMutation> {
    return this.mutate(athlete, templateId, (template, translate) =>
      template.moveExercise(translate(entryId), direction, this.deps.clock.now()),
    );
  }

  async remove(athlete: Athlete, templateId: string): Promise<Result<void, 'not-found' | 'sample-template'>> {
    return this.unitOfWork.run(async () => {
      const template = await this.templates.findVisible(athlete.id, templateId);
      if (!template) return err('not-found' as const);
      if (!template.isDeletable) return err('sample-template' as const);

      await this.templates.delete(template.id);
      return ok();
    });
  }

  async revert(
    athlete: Athlete,
    templateId: string,
  ): Promise<Result<{ forkedFromId: string }, 'not-found' | 'nothing-to-revert'>> {
    return this.unitOfWork.run(async () => {
      const template = await this.templates.findVisible(athlete.id, templateId);
      if (!template) return err('not-found' as const);
      if (!template.canRevert || !template.forkedFromId) {
        return err('nothing-to-revert' as const);
      }

      const forkedFromId = template.forkedFromId;
      await this.templates.delete(template.id);
      return ok({ forkedFromId });
    });
  }

  /** Where the athlete's chosen units are converted to canonical storage. */
  private toTarget(athlete: Athlete, input: TargetInput): SetTarget {
    const { weightUnit, distanceUnit } = athlete.preferences;
    return SetTarget.of({
      sets: input.sets,
      reps: input.reps,
      weight: input.weight != null ? Weight.in(weightUnit, input.weight) : null,
      duration: input.durationMinutes != null ? Duration.minutes(input.durationMinutes) : null,
      speed: input.speed != null ? Speed.in(distanceUnit, input.speed) : null,
      resistance: input.resistance,
    });
  }

  private async mutate(
    athlete: Athlete,
    templateId: string,
    apply: (template: WorkoutTemplate, translate: (id: string) => string) => void,
  ): Promise<TemplateMutation> {
    return this.unitOfWork.run(async () => {
      const loaded = await this.templates.findVisible(athlete.id, templateId);
      if (!loaded) return err('not-found' as const);

      const copy = await this.editableCopy(loaded, athlete);
      apply(copy.editable, copy.translateChildId);
      await this.templates.save(copy.editable);

      return ok({ forkedId: copy.forkedId });
    });
  }

  private editableCopy(template: WorkoutTemplate, athlete: Athlete) {
    return resolveEditableCopy(
      template,
      athlete.id,
      this.deps,
      (sampleId) => this.templates.findForkOf(athlete.id, sampleId),
      (candidate) => candidate.exercises,
    );
  }
}
