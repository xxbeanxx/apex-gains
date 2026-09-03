import {
  and,
  asc,
  desc,
  eq,
  isNotNull,
  isNull,
  notInArray,
  or,
  type SQL,
} from "drizzle-orm";

import { db, type Transaction } from "~/db/index.server";
import {
  exercises,
  templateExercises,
  templates,
  type Template,
  type TemplateExercise,
} from "~/db/schema";

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

export function sampleOrOwnTemplatesWhere(
  userId: string,
  showSampleData: boolean,
): SQL {
  const ownCondition = eq(templates.userId, userId);
  if (!showSampleData) return ownCondition;
  const forkedSampleIds = db
    .select({ id: templates.forkedFromId })
    .from(templates)
    .where(
      and(eq(templates.userId, userId), isNotNull(templates.forkedFromId)),
    );
  return or(
    ownCondition,
    and(isNull(templates.userId), notInArray(templates.id, forkedSampleIds)),
  )!;
}

function visibleToUserWhere(userId: string, templateId: string): SQL {
  return and(
    eq(templates.id, templateId),
    or(eq(templates.userId, userId), isNull(templates.userId)),
  )!;
}

type LoadedTemplate = Template & { templateExercises: TemplateExercise[] };

async function loadForMutation(
  tx: Transaction,
  userId: string,
  templateId: string,
): Promise<LoadedTemplate | undefined> {
  return tx.query.templates.findFirst({
    where: visibleToUserWhere(userId, templateId),
    with: { templateExercises: { orderBy: asc(templateExercises.position) } },
  });
}

// A sample (userId null) template a user edits gets copied into a real,
// per-user row, including its exercises - see CLAUDE.md's "Sample data and
// fork-on-write". Must run inside the same transaction as whatever
// mutation triggered the fork.
async function forkTemplateForUser(
  tx: Transaction,
  sample: LoadedTemplate,
  userId: string,
): Promise<{ fork: Template; forkedTemplateExercises: TemplateExercise[] }> {
  const existingFork = await tx.query.templates.findFirst({
    where: and(
      eq(templates.userId, userId),
      eq(templates.forkedFromId, sample.id),
    ),
    with: {
      templateExercises: { orderBy: asc(templateExercises.position) },
    },
  });
  if (existingFork) {
    return {
      fork: existingFork,
      forkedTemplateExercises: existingFork.templateExercises,
    };
  }

  const [fork] = await tx
    .insert(templates)
    .values({ userId, forkedFromId: sample.id, name: sample.name })
    .returning();

  const sorted = [...sample.templateExercises].sort(
    (a, b) => a.position - b.position,
  );
  const forkedTemplateExercises =
    sorted.length > 0
      ? await tx
          .insert(templateExercises)
          .values(
            sorted.map((te) => ({
              templateId: fork.id,
              exerciseId: te.exerciseId,
              position: te.position,
              targetSets: te.targetSets,
              targetReps: te.targetReps,
              targetWeight: te.targetWeight,
              targetDurationSeconds: te.targetDurationSeconds,
              targetSpeed: te.targetSpeed,
              targetResistance: te.targetResistance,
            })),
          )
          .returning()
      : [];

  return { fork, forkedTemplateExercises };
}

// Every mutating method's first step: fork the template if it's still a
// sample, and if a templateExerciseId was given, remap it onto the fork's
// copy of the same slot (matched by position - the fork gets fresh ids).
// If a remap can't find a match, the original id is kept, matching the
// route's previous behavior of leaving the id untouched (some mutations
// then simply no-op against the fork's rows).
async function resolveActiveTemplate(
  tx: Transaction,
  template: LoadedTemplate,
  userId: string,
  templateExerciseId: string | undefined,
): Promise<{
  activeTemplateId: string;
  forkedTemplateId: string | null;
  activeTemplateExercises: TemplateExercise[];
  remappedTemplateExerciseId: string | undefined;
}> {
  if (template.userId !== null) {
    return {
      activeTemplateId: template.id,
      forkedTemplateId: null,
      activeTemplateExercises: template.templateExercises,
      remappedTemplateExerciseId: templateExerciseId,
    };
  }

  const originalPosition = templateExerciseId
    ? template.templateExercises.find((te) => te.id === templateExerciseId)
        ?.position
    : undefined;

  const { fork, forkedTemplateExercises } = await forkTemplateForUser(
    tx,
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

export class DrizzleTemplatesRepository implements TemplatesRepository {
  async listForUser(
    userId: string,
    showSampleData: boolean,
  ): Promise<TemplateWithExerciseCount[]> {
    return db.query.templates.findMany({
      where: sampleOrOwnTemplatesWhere(userId, showSampleData),
      orderBy: desc(templates.updatedAt),
      with: { templateExercises: true },
    });
  }

  async findVisibleForUser(
    userId: string,
    templateId: string,
  ): Promise<TemplateDetail | null> {
    const template = await db.query.templates.findFirst({
      where: visibleToUserWhere(userId, templateId),
      with: {
        templateExercises: {
          orderBy: asc(templateExercises.position),
          with: { exercise: true },
        },
      },
    });
    return template ?? null;
  }

  async create(userId: string, name: string): Promise<Template> {
    const [template] = await db
      .insert(templates)
      .values({ userId, name })
      .returning();
    return template;
  }

  async delete(
    userId: string,
    templateId: string,
  ): Promise<DeleteTemplateOutcome> {
    const template = await db.query.templates.findFirst({
      where: visibleToUserWhere(userId, templateId),
    });
    if (!template) return { outcome: "not-found" };
    if (template.userId === null) return { outcome: "sample-template" };

    await db.delete(templates).where(eq(templates.id, template.id));
    return { outcome: "deleted" };
  }

  async revert(
    userId: string,
    templateId: string,
  ): Promise<RevertTemplateOutcome> {
    const template = await db.query.templates.findFirst({
      where: visibleToUserWhere(userId, templateId),
    });
    if (!template) return { outcome: "not-found" };
    if (template.userId !== userId || !template.forkedFromId) {
      return { outcome: "nothing-to-revert" };
    }
    await db.delete(templates).where(eq(templates.id, template.id));
    return { outcome: "reverted", forkedFromId: template.forkedFromId };
  }

  async rename(
    userId: string,
    templateId: string,
    name: string,
  ): Promise<RenameTemplateOutcome> {
    return db.transaction(async (tx) => {
      const template = await loadForMutation(tx, userId, templateId);
      if (!template) return { outcome: "not-found" };

      const { activeTemplateId, forkedTemplateId } =
        await resolveActiveTemplate(tx, template, userId, undefined);

      await tx
        .update(templates)
        .set({ name, updatedAt: new Date() })
        .where(eq(templates.id, activeTemplateId));

      return { outcome: "renamed", forkedTemplateId };
    });
  }

  async addExercise(
    userId: string,
    templateId: string,
    input: AddTemplateExerciseInput,
  ): Promise<AddTemplateExerciseOutcome> {
    return db.transaction(async (tx) => {
      const template = await loadForMutation(tx, userId, templateId);
      if (!template) return { outcome: "not-found" };

      const { activeTemplateId, forkedTemplateId, activeTemplateExercises } =
        await resolveActiveTemplate(tx, template, userId, undefined);

      const exercise = await tx.query.exercises.findFirst({
        where: eq(exercises.id, input.exerciseId),
      });
      if (!exercise) return { outcome: "exercise-not-found" };

      const nextPosition =
        activeTemplateExercises.reduce(
          (max, te) => Math.max(max, te.position),
          -1,
        ) + 1;

      await tx.insert(templateExercises).values({
        templateId: activeTemplateId,
        exerciseId: exercise.id,
        position: nextPosition,
        targetSets: input.targetSets ?? null,
        targetReps: input.targetReps ?? null,
        targetWeight: input.targetWeight != null ? String(input.targetWeight) : null,
        targetDurationSeconds: input.targetDurationSeconds ?? null,
        targetSpeed: input.targetSpeed != null ? String(input.targetSpeed) : null,
        targetResistance: input.targetResistance ?? null,
      });

      return { outcome: "added", forkedTemplateId };
    });
  }

  async removeExercise(
    userId: string,
    templateId: string,
    templateExerciseId: string,
  ): Promise<RemoveTemplateExerciseOutcome> {
    return db.transaction(async (tx) => {
      const template = await loadForMutation(tx, userId, templateId);
      if (!template) return { outcome: "not-found" };

      const { activeTemplateId, forkedTemplateId, remappedTemplateExerciseId } =
        await resolveActiveTemplate(tx, template, userId, templateExerciseId);

      await tx
        .delete(templateExercises)
        .where(
          and(
            eq(templateExercises.id, remappedTemplateExerciseId!),
            eq(templateExercises.templateId, activeTemplateId),
          ),
        );

      return { outcome: "removed", forkedTemplateId };
    });
  }

  async moveExercise(
    userId: string,
    templateId: string,
    templateExerciseId: string,
    direction: "up" | "down",
  ): Promise<MoveTemplateExerciseOutcome> {
    return db.transaction(async (tx) => {
      const template = await loadForMutation(tx, userId, templateId);
      if (!template) return { outcome: "not-found" };

      const { forkedTemplateId, activeTemplateExercises, remappedTemplateExerciseId } =
        await resolveActiveTemplate(tx, template, userId, templateExerciseId);

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

      // Swap through a scratch value (-1) to dodge the
      // (templateId, position) unique constraint.
      await tx
        .update(templateExercises)
        .set({ position: -1 })
        .where(eq(templateExercises.id, current.id));
      await tx
        .update(templateExercises)
        .set({ position: current.position })
        .where(eq(templateExercises.id, swap.id));
      await tx
        .update(templateExercises)
        .set({ position: swap.position })
        .where(eq(templateExercises.id, current.id));

      return { outcome: "moved", forkedTemplateId };
    });
  }
}
