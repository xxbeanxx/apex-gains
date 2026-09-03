import {
  and,
  asc,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
  notInArray,
  or,
  type SQL,
} from "drizzle-orm";

import { db, dbScope } from "~/db/index.server";
import {
  templateExercises,
  templates,
  type Template as TemplateRow,
  type TemplateExercise as TemplateExerciseRow,
} from "~/db/schema";
import {
  WorkoutTemplate,
  type TemplateExerciseSnapshot,
} from "~/domain/template/workout-template";

import { diffChildren } from "../shared/diff-children";
import { writePositions } from "../shared/write-positions";
import type { TemplatesRepository } from "../templates-repository.server";

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

type RowWithExercises = TemplateRow & {
  templateExercises: TemplateExerciseRow[];
};

function toTemplate(row: RowWithExercises): WorkoutTemplate {
  return WorkoutTemplate.fromSnapshot({
    id: row.id,
    userId: row.userId,
    forkedFromId: row.forkedFromId,
    name: row.name,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    exercises: row.templateExercises.map((entry) => ({
      id: entry.id,
      exerciseId: entry.exerciseId,
      position: entry.position,
      targetSets: entry.targetSets,
      targetReps: entry.targetReps,
      targetWeight: entry.targetWeight,
      targetDurationSeconds: entry.targetDurationSeconds,
      targetSpeed: entry.targetSpeed,
      targetResistance: entry.targetResistance,
    })),
  });
}

function toRow(templateId: string, entry: TemplateExerciseSnapshot) {
  return {
    id: entry.id,
    templateId,
    exerciseId: entry.exerciseId,
    position: entry.position,
    targetSets: entry.targetSets,
    targetReps: entry.targetReps,
    targetWeight: entry.targetWeight,
    targetDurationSeconds: entry.targetDurationSeconds,
    targetSpeed: entry.targetSpeed,
    targetResistance: entry.targetResistance,
  };
}

export class DrizzleTemplatesRepository implements TemplatesRepository {
  async listFor(
    userId: string,
    showSampleData: boolean,
  ): Promise<WorkoutTemplate[]> {
    const rows = await dbScope.query.templates.findMany({
      where: sampleOrOwnTemplatesWhere(userId, showSampleData),
      orderBy: desc(templates.updatedAt),
      with: {
        templateExercises: { orderBy: asc(templateExercises.position) },
      },
    });
    return rows.map(toTemplate);
  }

  async findVisible(
    userId: string,
    templateId: string,
  ): Promise<WorkoutTemplate | null> {
    const row = await dbScope.query.templates.findFirst({
      where: visibleToUserWhere(userId, templateId),
      with: {
        templateExercises: { orderBy: asc(templateExercises.position) },
      },
    });
    return row ? toTemplate(row) : null;
  }

  async findForkOf(
    userId: string,
    sampleId: string,
  ): Promise<WorkoutTemplate | null> {
    const row = await dbScope.query.templates.findFirst({
      where: and(
        eq(templates.userId, userId),
        eq(templates.forkedFromId, sampleId),
      ),
      with: {
        templateExercises: { orderBy: asc(templateExercises.position) },
      },
    });
    return row ? toTemplate(row) : null;
  }

  /**
   * Writes the template and its exercise entries as one unit.
   *
   * The order matters, and it is the reason this reads as more than an
   * upsert: removals free their positions first, then everything that moved
   * is repositioned through negative scratch values (see
   * shared/write-positions.ts), and only then are new entries inserted at
   * their final positions. Any other order can transiently violate the
   * `(templateId, position)` unique constraint.
   *
   * Callers run this inside a UnitOfWork, so the intermediate states are
   * never visible to anyone else.
   */
  async save(template: WorkoutTemplate): Promise<void> {
    const snapshot = template.toSnapshot();

    await dbScope
      .insert(templates)
      .values({
        id: snapshot.id,
        userId: snapshot.userId,
        forkedFromId: snapshot.forkedFromId,
        name: snapshot.name,
        createdAt: snapshot.createdAt,
        updatedAt: snapshot.updatedAt,
      })
      .onConflictDoUpdate({
        target: templates.id,
        set: { name: snapshot.name, updatedAt: snapshot.updatedAt },
      });

    const existing = await dbScope
      .select()
      .from(templateExercises)
      .where(eq(templateExercises.templateId, snapshot.id));

    const diff = diffChildren(existing, snapshot.exercises);

    if (diff.deletedIds.length > 0) {
      await dbScope
        .delete(templateExercises)
        .where(inArray(templateExercises.id, diff.deletedIds));
    }

    for (const entry of diff.updated) {
      const row = toRow(snapshot.id, entry);
      await dbScope
        .update(templateExercises)
        .set({
          exerciseId: row.exerciseId,
          targetSets: row.targetSets,
          targetReps: row.targetReps,
          targetWeight: row.targetWeight,
          targetDurationSeconds: row.targetDurationSeconds,
          targetSpeed: row.targetSpeed,
          targetResistance: row.targetResistance,
        })
        .where(eq(templateExercises.id, row.id));
    }

    await writePositions(
      new Map(existing.map((row) => [row.id, row.position])),
      diff.updated,
      (id, position) =>
        dbScope
          .update(templateExercises)
          .set({ position })
          .where(eq(templateExercises.id, id)),
    );

    if (diff.inserted.length > 0) {
      await dbScope
        .insert(templateExercises)
        .values(diff.inserted.map((entry) => toRow(snapshot.id, entry)));
    }
  }

  async delete(templateId: string): Promise<void> {
    await dbScope.delete(templates).where(eq(templates.id, templateId));
  }
}
