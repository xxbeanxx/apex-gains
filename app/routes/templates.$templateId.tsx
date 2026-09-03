import { and, asc, eq, isNull, or } from "drizzle-orm";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  ListPlusIcon,
  PlusIcon,
  RotateCcwIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";
import { useState } from "react";
import { data, redirect, useFetcher } from "react-router";
import { z } from "zod";

import { userContext } from "~/auth/user-context";
import { Page, PageHeader, Section } from "~/components/layout/page";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { EmptyState } from "~/components/ui/empty-state";
import { Field } from "~/components/ui/field";
import { Input } from "~/components/ui/input";
import { SubmitButton } from "~/components/ui/submit-button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { db } from "~/db/index.server";
import { type Exercise, exercises, templateExercises, templates } from "~/db/schema";
import { loggerContext } from "~/lib/logger.server";
import {
  forkTemplateForUser,
  sampleOrOwnExercisesWhere,
} from "~/lib/sample-data.server";

import type { Route } from "./+types/templates.$templateId";

export function meta({ loaderData }: Route.MetaArgs) {
  return [
    { title: `${loaderData?.template.name ?? "Template"} - Apex Gains` },
  ];
}

async function loadVisibleTemplate(templateId: string, userId: string) {
  const template = await db.query.templates.findFirst({
    where: and(
      eq(templates.id, templateId),
      or(eq(templates.userId, userId), isNull(templates.userId)),
    ),
    with: {
      templateExercises: {
        orderBy: asc(templateExercises.position),
        with: { exercise: true },
      },
    },
  });
  return template ?? null;
}

export async function loader({ params, context }: Route.LoaderArgs) {
  const user = context.get(userContext)!;
  const template = await loadVisibleTemplate(params.templateId, user.id);
  if (!template) {
    throw data("Template not found", { status: 404 });
  }
  const allExercises = await db
    .select()
    .from(exercises)
    .where(sampleOrOwnExercisesWhere(user.id, user.showSampleData))
    .orderBy(asc(exercises.name));
  return { template, exercises: allExercises };
}

const renameSchema = z.object({
  name: z.string().trim().min(1).max(100),
});

const addExerciseSchema = z.object({
  exerciseId: z.uuid(),
  targetSets: z.coerce.number().int().positive().optional(),
  targetReps: z.coerce.number().int().positive().optional(),
  targetWeight: z.coerce.number().positive().optional(),
  targetDurationMinutes: z.coerce.number().positive().optional(),
  targetSpeed: z.coerce.number().positive().optional(),
  targetResistance: z.coerce.number().int().positive().optional(),
});

export async function action({ request, params, context }: Route.ActionArgs) {
  const user = context.get(userContext)!;
  const template = await loadVisibleTemplate(params.templateId, user.id);
  if (!template) {
    throw data("Template not found", { status: 404 });
  }

  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "delete") {
    if (template.userId === null) {
      return data(
        { error: "Sample templates can't be deleted." },
        { status: 400 },
      );
    }
    await db.delete(templates).where(eq(templates.id, template.id));
    context
      .get(loggerContext)
      .info({ userId: user.id, templateId: template.id }, "template deleted");
    throw redirect("/templates");
  }

  if (intent === "revert") {
    if (template.userId !== user.id || !template.forkedFromId) {
      return data({ error: "Nothing to revert" }, { status: 400 });
    }
    const forkedFromId = template.forkedFromId;
    await db.delete(templates).where(eq(templates.id, template.id));
    throw redirect(`/templates/${forkedFromId}`);
  }

  // Every remaining intent mutates the template's own content, so editing a
  // sample template forks it into a personal copy first (fork-on-save) and
  // the mutation below is applied to the fork instead of the sample.
  const didFork = template.userId === null;
  let activeTemplateId = template.id;
  let activeTemplateExercises: { id: string; position: number }[] =
    template.templateExercises;

  if (didFork) {
    if (
      intent !== "rename" &&
      intent !== "addExercise" &&
      intent !== "removeExercise" &&
      intent !== "move"
    ) {
      return data({ error: "Unknown action" }, { status: 400 });
    }

    const submittedTemplateExerciseId = formData.get("templateExerciseId");
    const originalPosition =
      typeof submittedTemplateExerciseId === "string"
        ? template.templateExercises.find(
            (te) => te.id === submittedTemplateExerciseId,
          )?.position
        : undefined;

    const { fork, forkedTemplateExercises } = await db.transaction((tx) =>
      forkTemplateForUser(tx, template, user.id),
    );
    activeTemplateId = fork.id;
    activeTemplateExercises = forkedTemplateExercises;

    if (originalPosition !== undefined) {
      const forkedMatch = forkedTemplateExercises.find(
        (te) => te.position === originalPosition,
      );
      if (forkedMatch) formData.set("templateExerciseId", forkedMatch.id);
    }
  }

  if (intent === "rename") {
    const result = renameSchema.safeParse({ name: formData.get("name") });
    if (!result.success) {
      return data({ error: "Invalid name" }, { status: 400 });
    }
    await db
      .update(templates)
      .set({ name: result.data.name, updatedAt: new Date() })
      .where(eq(templates.id, activeTemplateId));
    if (didFork) throw redirect(`/templates/${activeTemplateId}`);
    return { ok: true };
  }

  if (intent === "addExercise") {
    const raw = Object.fromEntries(formData);
    const result = addExerciseSchema.safeParse(raw);
    if (!result.success) {
      return data({ error: "Invalid exercise" }, { status: 400 });
    }
    const exercise = await db.query.exercises.findFirst({
      where: eq(exercises.id, result.data.exerciseId),
    });
    if (!exercise) {
      return data({ error: "Exercise not found" }, { status: 400 });
    }

    const nextPosition =
      activeTemplateExercises.reduce(
        (max, te) => Math.max(max, te.position),
        -1,
      ) + 1;

    await db.insert(templateExercises).values({
      templateId: activeTemplateId,
      exerciseId: exercise.id,
      position: nextPosition,
      targetSets: result.data.targetSets ?? null,
      targetReps: result.data.targetReps ?? null,
      targetWeight: result.data.targetWeight?.toString() ?? null,
      targetDurationSeconds: result.data.targetDurationMinutes
        ? Math.round(result.data.targetDurationMinutes * 60)
        : null,
      targetSpeed: result.data.targetSpeed?.toString() ?? null,
      targetResistance: result.data.targetResistance ?? null,
    });
    if (didFork) throw redirect(`/templates/${activeTemplateId}`);
    return { ok: true };
  }

  if (intent === "removeExercise") {
    const templateExerciseId = String(formData.get("templateExerciseId"));
    await db
      .delete(templateExercises)
      .where(
        and(
          eq(templateExercises.id, templateExerciseId),
          eq(templateExercises.templateId, activeTemplateId),
        ),
      );
    if (didFork) throw redirect(`/templates/${activeTemplateId}`);
    return { ok: true };
  }

  if (intent === "move") {
    const templateExerciseId = String(formData.get("templateExerciseId"));
    const direction = formData.get("direction");
    const sorted = [...activeTemplateExercises].sort(
      (a, b) => a.position - b.position,
    );
    const index = sorted.findIndex((te) => te.id === templateExerciseId);
    const swapIndex = direction === "up" ? index - 1 : index + 1;
    if (index === -1 || swapIndex < 0 || swapIndex >= sorted.length) {
      if (didFork) throw redirect(`/templates/${activeTemplateId}`);
      return { ok: true };
    }
    const current = sorted[index];
    const swap = sorted[swapIndex];

    await db.transaction(async (tx) => {
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
    });
    if (didFork) throw redirect(`/templates/${activeTemplateId}`);
    return { ok: true };
  }

  return data({ error: "Unknown action" }, { status: 400 });
}

function targetSummary(te: {
  targetSets: number | null;
  targetReps: number | null;
  targetWeight: string | null;
  targetDurationSeconds: number | null;
  targetSpeed: string | null;
  targetResistance: number | null;
}) {
  const parts: string[] = [];
  if (te.targetSets && te.targetReps) {
    parts.push(`${te.targetSets} x ${te.targetReps}`);
  }
  if (te.targetWeight) parts.push(`${te.targetWeight} lb`);
  if (te.targetDurationSeconds) {
    parts.push(`${Math.round(te.targetDurationSeconds / 60)} min`);
  }
  if (te.targetSpeed) parts.push(`${te.targetSpeed} speed`);
  if (te.targetResistance) parts.push(`resistance ${te.targetResistance}`);
  return parts.length > 0 ? parts.join(", ") : "No target set";
}

function AddExerciseForm({ exerciseList }: { exerciseList: Exercise[] }) {
  const fetcher = useFetcher();
  const [exerciseId, setExerciseId] = useState<string>("");
  const selected = exerciseList.find((e) => e.id === exerciseId);

  const pending = fetcher.state !== "idle";

  return (
    <fetcher.Form method="post" className="flex flex-col gap-4">
      <input type="hidden" name="intent" value="addExercise" />
      <Field label="Exercise">
        {({ id }) => (
          <Select
            name="exerciseId"
            value={exerciseId}
            onValueChange={setExerciseId}
          >
            <SelectTrigger id={id} className="w-full">
              <SelectValue placeholder="Choose an exercise" />
            </SelectTrigger>
            <SelectContent>
              {exerciseList.map((exercise) => (
                <SelectItem key={exercise.id} value={exercise.id}>
                  {exercise.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </Field>

      {selected?.exerciseType === "strength" ? (
        <div className="grid grid-cols-3 gap-3">
          <Field label="Sets">
            <Input name="targetSets" type="number" min={1} inputMode="numeric" />
          </Field>
          <Field label="Reps">
            <Input name="targetReps" type="number" min={1} inputMode="numeric" />
          </Field>
          <Field label="Weight">
            <Input
              name="targetWeight"
              type="number"
              min={0}
              step="0.5"
              inputMode="decimal"
            />
          </Field>
        </div>
      ) : null}

      {selected?.exerciseType === "cardio" ? (
        <div className="grid grid-cols-3 gap-3">
          <Field label="Minutes">
            <Input
              name="targetDurationMinutes"
              type="number"
              min={1}
              inputMode="numeric"
            />
          </Field>
          <Field label="Speed">
            <Input
              name="targetSpeed"
              type="number"
              min={0}
              step="0.1"
              inputMode="decimal"
            />
          </Field>
          <Field label="Resistance">
            <Input
              name="targetResistance"
              type="number"
              min={1}
              inputMode="numeric"
            />
          </Field>
        </div>
      ) : null}

      <SubmitButton
        pending={pending}
        pendingLabel="Adding exercise"
        disabled={!exerciseId}
        variant="brand"
        className="self-start"
      >
        {pending ? null : <PlusIcon aria-hidden="true" />}
        Add exercise
      </SubmitButton>
    </fetcher.Form>
  );
}

export default function TemplateDetail({ loaderData }: Route.ComponentProps) {
  const { template, exercises: exerciseList } = loaderData;

  const exerciseCount = template.templateExercises.length;
  const isSample = template.userId === null;
  const isCustomized = template.forkedFromId !== null;

  return (
    <Page width="narrow">
      <PageHeader
        title={template.name}
        badge={
          isSample ? (
            <Badge variant="outline">Sample</Badge>
          ) : isCustomized ? (
            <Badge variant="secondary">Customized</Badge>
          ) : null
        }
        description={`${exerciseCount} exercise${exerciseCount === 1 ? "" : "s"} in this workout.`}
        actions={
          isSample ? null : isCustomized ? (
            <form method="post">
              <input type="hidden" name="intent" value="revert" />
              <SubmitButton
                variant="outline"
                size="sm"
                match={{ intent: "revert" }}
                pendingLabel="Reverting"
              >
                <RotateCcwIcon aria-hidden="true" />
                Revert to sample
              </SubmitButton>
            </form>
          ) : (
            <form method="post">
              <input type="hidden" name="intent" value="delete" />
              <SubmitButton
                variant="destructive"
                size="sm"
                match={{ intent: "delete" }}
                pendingLabel="Deleting template"
              >
                <Trash2Icon aria-hidden="true" />
                Delete template
              </SubmitButton>
            </form>
          )
        }
      />

      {isCustomized ? (
        <p className="mt-(--section-gap) text-sm text-muted-foreground">
          This is your customized copy of a sample template. The original
          sample is unaffected.
        </p>
      ) : null}

      <Card className="mt-(--section-gap) max-w-md">
        <CardHeader>
          <CardTitle>Rename</CardTitle>
          {isSample ? (
            <p className="text-sm text-muted-foreground">
              Renaming a sample template creates your own customized copy.
            </p>
          ) : null}
        </CardHeader>
        <CardContent>
          <form method="post">
            <input type="hidden" name="intent" value="rename" />
            <Field
              label="Name"
              action={
                <SubmitButton match={{ intent: "rename" }} pendingLabel="Saving">
                  Save
                </SubmitButton>
              }
            >
              <Input name="name" defaultValue={template.name} required />
            </Field>
          </form>
        </CardContent>
      </Card>

      <Section
        title="Exercises"
        description="Targets pre-fill the logging form on the Today page; every field stays editable per set."
      >
        {exerciseCount === 0 ? (
          <EmptyState
            icon={ListPlusIcon}
            title="No exercises yet"
            description="Add the first movement using the form below."
            compact
          />
        ) : (
          <ol className="grid gap-3 lg:grid-cols-2">
            {template.templateExercises.map((te, index) => (
              <li
                key={te.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-3 py-2.5 shadow-sm shadow-black/[0.03] transition-colors duration-(--dur) hover:border-ring/30 dark:shadow-black/20"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span
                    aria-hidden="true"
                    className="flex size-6 shrink-0 items-center justify-center rounded-md bg-muted text-xs font-semibold text-muted-foreground tabular-nums"
                  >
                    {index + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate font-medium">{te.exercise.name}</p>
                    <p className="truncate text-sm text-muted-foreground tabular-nums">
                      {targetSummary(te)}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-0.5">
                  <form method="post">
                    <input type="hidden" name="intent" value="move" />
                    <input
                      type="hidden"
                      name="templateExerciseId"
                      value={te.id}
                    />
                    <input type="hidden" name="direction" value="up" />
                    <Button
                      type="submit"
                      variant="ghost"
                      size="icon-sm"
                      disabled={index === 0}
                    >
                      <ArrowUpIcon aria-hidden="true" />
                      <span className="sr-only">
                        Move {te.exercise.name} up
                      </span>
                    </Button>
                  </form>
                  <form method="post">
                    <input type="hidden" name="intent" value="move" />
                    <input
                      type="hidden"
                      name="templateExerciseId"
                      value={te.id}
                    />
                    <input type="hidden" name="direction" value="down" />
                    <Button
                      type="submit"
                      variant="ghost"
                      size="icon-sm"
                      disabled={index === exerciseCount - 1}
                    >
                      <ArrowDownIcon aria-hidden="true" />
                      <span className="sr-only">
                        Move {te.exercise.name} down
                      </span>
                    </Button>
                  </form>
                  <form method="post">
                    <input type="hidden" name="intent" value="removeExercise" />
                    <input
                      type="hidden"
                      name="templateExerciseId"
                      value={te.id}
                    />
                    <Button
                      type="submit"
                      variant="ghost"
                      size="icon-sm"
                      className="hover:bg-destructive/10 hover:text-destructive"
                    >
                      <XIcon aria-hidden="true" />
                      <span className="sr-only">
                        Remove {te.exercise.name} from this template
                      </span>
                    </Button>
                  </form>
                </div>
              </li>
            ))}
          </ol>
        )}

        <Card className="max-w-xl">
          <CardHeader>
            <CardTitle>Add an exercise</CardTitle>
          </CardHeader>
          <CardContent>
            <AddExerciseForm exerciseList={exerciseList} />
          </CardContent>
        </Card>
      </Section>
    </Page>
  );
}
