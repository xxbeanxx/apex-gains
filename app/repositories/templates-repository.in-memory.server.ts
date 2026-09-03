import { randomUUID } from "node:crypto";

import type { Template, TemplateExercise } from "~/db/schema";

import type { ExercisesRepository } from "./exercises-repository";
import type {
  AddTemplateExerciseInput,
  AddTemplateExerciseOutcome,
  DeleteTemplateOutcome,
  MoveTemplateExerciseOutcome,
  RemoveTemplateExerciseOutcome,
  RenameTemplateOutcome,
  RevertTemplateOutcome,
  TemplateDetail,
  TemplatesRepository,
  TemplateWithExerciseCount,
} from "./templates-repository";

function isVisible(template: Template, userId: string): boolean {
  return template.userId === userId || template.userId === null;
}

// Dev-convenience adapter for running the app without a database
// configured (see templates-repository.server.ts for the selection rule).
// Data lives only for the life of the process. Like the exercises
// in-memory adapter, its fork-on-write path is presently unreachable:
// there's no in-memory equivalent of db/seed.ts, so nothing ever produces
// a sample (userId null) template here.
export class InMemoryTemplatesRepository implements TemplatesRepository {
  private readonly templatesById = new Map<string, Template>();
  private readonly templateExercisesById = new Map<string, TemplateExercise>();

  constructor(private readonly exercisesRepository: ExercisesRepository) {}

  async listForUser(
    userId: string,
    showSampleData: boolean,
  ): Promise<TemplateWithExerciseCount[]> {
    const all = [...this.templatesById.values()];
    const ownRows = all.filter((row) => row.userId === userId);
    const forkedSampleIds = new Set(
      ownRows
        .map((row) => row.forkedFromId)
        .filter((id): id is string => id !== null),
    );
    const rows = showSampleData
      ? [
          ...ownRows,
          ...all.filter(
            (row) => row.userId === null && !forkedSampleIds.has(row.id),
          ),
        ]
      : ownRows;

    return rows
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
      .map((template) => ({
        ...template,
        templateExercises: this.templateExercisesFor(template.id).map(
          (te) => ({ id: te.id, position: te.position }),
        ),
      }));
  }

  async findVisibleForUser(
    userId: string,
    templateId: string,
  ): Promise<TemplateDetail | null> {
    const template = this.templatesById.get(templateId);
    if (!template || !isVisible(template, userId)) return null;

    const sorted = this.templateExercisesFor(templateId).sort(
      (a, b) => a.position - b.position,
    );
    const templateExercises = await Promise.all(
      sorted.map(async (te) => ({
        ...te,
        // A logged template exercise always has a live exercise behind it -
        // Postgres enforces this with `onDelete: "restrict"`, which this
        // adapter doesn't replicate (see exercises-repository.in-memory).
        exercise: (await this.exercisesRepository.findById(te.exerciseId))!,
      })),
    );
    return { ...template, templateExercises };
  }

  async create(userId: string, name: string): Promise<Template> {
    const now = new Date();
    const template: Template = {
      id: randomUUID(),
      userId,
      forkedFromId: null,
      name,
      createdAt: now,
      updatedAt: now,
    };
    this.templatesById.set(template.id, template);
    return template;
  }

  async delete(
    userId: string,
    templateId: string,
  ): Promise<DeleteTemplateOutcome> {
    const template = this.templatesById.get(templateId);
    if (!template || !isVisible(template, userId)) {
      return { outcome: "not-found" };
    }
    if (template.userId === null) return { outcome: "sample-template" };

    this.templatesById.delete(templateId);
    this.deleteTemplateExercisesFor(templateId);
    return { outcome: "deleted" };
  }

  async revert(
    userId: string,
    templateId: string,
  ): Promise<RevertTemplateOutcome> {
    const template = this.templatesById.get(templateId);
    if (!template || !isVisible(template, userId)) {
      return { outcome: "not-found" };
    }
    if (template.userId !== userId || !template.forkedFromId) {
      return { outcome: "nothing-to-revert" };
    }
    this.templatesById.delete(templateId);
    this.deleteTemplateExercisesFor(templateId);
    return { outcome: "reverted", forkedFromId: template.forkedFromId };
  }

  async rename(
    userId: string,
    templateId: string,
    name: string,
  ): Promise<RenameTemplateOutcome> {
    const template = this.templatesById.get(templateId);
    if (!template || !isVisible(template, userId)) {
      return { outcome: "not-found" };
    }

    const { activeTemplateId, forkedTemplateId } = this.resolveActiveTemplate(
      template,
      userId,
      undefined,
    );
    const active = this.templatesById.get(activeTemplateId)!;
    this.templatesById.set(activeTemplateId, {
      ...active,
      name,
      updatedAt: new Date(),
    });
    return { outcome: "renamed", forkedTemplateId };
  }

  async addExercise(
    userId: string,
    templateId: string,
    input: AddTemplateExerciseInput,
  ): Promise<AddTemplateExerciseOutcome> {
    const template = this.templatesById.get(templateId);
    if (!template || !isVisible(template, userId)) {
      return { outcome: "not-found" };
    }

    const { activeTemplateId, forkedTemplateId, activeTemplateExercises } =
      this.resolveActiveTemplate(template, userId, undefined);

    const exercise = await this.exercisesRepository.findById(
      input.exerciseId,
    );
    if (!exercise) return { outcome: "exercise-not-found" };

    const nextPosition =
      activeTemplateExercises.reduce(
        (max, te) => Math.max(max, te.position),
        -1,
      ) + 1;
    const templateExercise: TemplateExercise = {
      id: randomUUID(),
      templateId: activeTemplateId,
      exerciseId: exercise.id,
      position: nextPosition,
      targetSets: input.targetSets ?? null,
      targetReps: input.targetReps ?? null,
      targetWeight: input.targetWeight != null ? String(input.targetWeight) : null,
      targetDurationSeconds: input.targetDurationSeconds ?? null,
      targetSpeed: input.targetSpeed != null ? String(input.targetSpeed) : null,
      targetResistance: input.targetResistance ?? null,
    };
    this.templateExercisesById.set(templateExercise.id, templateExercise);
    return { outcome: "added", forkedTemplateId };
  }

  async removeExercise(
    userId: string,
    templateId: string,
    templateExerciseId: string,
  ): Promise<RemoveTemplateExerciseOutcome> {
    const template = this.templatesById.get(templateId);
    if (!template || !isVisible(template, userId)) {
      return { outcome: "not-found" };
    }

    const { activeTemplateId, forkedTemplateId, remappedTemplateExerciseId } =
      this.resolveActiveTemplate(template, userId, templateExerciseId);

    const target = remappedTemplateExerciseId
      ? this.templateExercisesById.get(remappedTemplateExerciseId)
      : undefined;
    if (target && target.templateId === activeTemplateId) {
      this.templateExercisesById.delete(target.id);
    }
    return { outcome: "removed", forkedTemplateId };
  }

  async moveExercise(
    userId: string,
    templateId: string,
    templateExerciseId: string,
    direction: "up" | "down",
  ): Promise<MoveTemplateExerciseOutcome> {
    const template = this.templatesById.get(templateId);
    if (!template || !isVisible(template, userId)) {
      return { outcome: "not-found" };
    }

    const { forkedTemplateId, activeTemplateExercises, remappedTemplateExerciseId } =
      this.resolveActiveTemplate(template, userId, templateExerciseId);

    const sorted = [...activeTemplateExercises].sort(
      (a, b) => a.position - b.position,
    );
    const index = sorted.findIndex(
      (te) => te.id === remappedTemplateExerciseId,
    );
    const swapIndex = direction === "up" ? index - 1 : index + 1;
    if (index === -1 || swapIndex < 0 || swapIndex >= sorted.length) {
      return { outcome: "no-op", forkedTemplateId };
    }
    const current = sorted[index];
    const swap = sorted[swapIndex];
    this.templateExercisesById.set(current.id, {
      ...current,
      position: swap.position,
    });
    this.templateExercisesById.set(swap.id, {
      ...swap,
      position: current.position,
    });
    return { outcome: "moved", forkedTemplateId };
  }

  private resolveActiveTemplate(
    template: Template,
    userId: string,
    templateExerciseId: string | undefined,
  ): {
    activeTemplateId: string;
    forkedTemplateId: string | null;
    activeTemplateExercises: TemplateExercise[];
    remappedTemplateExerciseId: string | undefined;
  } {
    const templateExercises = this.templateExercisesFor(template.id);
    if (template.userId !== null) {
      return {
        activeTemplateId: template.id,
        forkedTemplateId: null,
        activeTemplateExercises: templateExercises,
        remappedTemplateExerciseId: templateExerciseId,
      };
    }

    const originalPosition = templateExerciseId
      ? templateExercises.find((te) => te.id === templateExerciseId)?.position
      : undefined;

    const { fork, forkedTemplateExercises } = this.forkForUser(
      template,
      userId,
    );

    const remappedTemplateExerciseId =
      originalPosition !== undefined
        ? (forkedTemplateExercises.find((te) => te.position === originalPosition)
            ?.id ?? templateExerciseId)
        : templateExerciseId;

    return {
      activeTemplateId: fork.id,
      forkedTemplateId: fork.id,
      activeTemplateExercises: forkedTemplateExercises,
      remappedTemplateExerciseId,
    };
  }

  private forkForUser(
    sample: Template,
    userId: string,
  ): { fork: Template; forkedTemplateExercises: TemplateExercise[] } {
    const existingFork = [...this.templatesById.values()].find(
      (row) => row.userId === userId && row.forkedFromId === sample.id,
    );
    if (existingFork) {
      return {
        fork: existingFork,
        forkedTemplateExercises: this.templateExercisesFor(existingFork.id),
      };
    }

    const now = new Date();
    const fork: Template = {
      ...sample,
      id: randomUUID(),
      userId,
      forkedFromId: sample.id,
      createdAt: now,
      updatedAt: now,
    };
    this.templatesById.set(fork.id, fork);

    const sorted = this.templateExercisesFor(sample.id).sort(
      (a, b) => a.position - b.position,
    );
    const forkedTemplateExercises = sorted.map((te) => {
      const forked: TemplateExercise = { ...te, id: randomUUID(), templateId: fork.id };
      this.templateExercisesById.set(forked.id, forked);
      return forked;
    });

    return { fork, forkedTemplateExercises };
  }

  private templateExercisesFor(templateId: string): TemplateExercise[] {
    return [...this.templateExercisesById.values()].filter(
      (te) => te.templateId === templateId,
    );
  }

  private deleteTemplateExercisesFor(templateId: string): void {
    for (const te of this.templateExercisesFor(templateId)) {
      this.templateExercisesById.delete(te.id);
    }
  }
}
