import { and, asc, eq } from "drizzle-orm";
import { useState } from "react";
import { data, redirect, useFetcher } from "react-router";
import { z } from "zod";

import { userContext } from "~/auth/user-context";
import { Button } from "~/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { db } from "~/db/index.server";
import { type Exercise, exercises, templateExercises, templates } from "~/db/schema";

import type { Route } from "./+types/templates.$templateId";

export function meta({ loaderData }: Route.MetaArgs) {
  return [
    { title: `${loaderData?.template.name ?? "Template"} - Apex Gains` },
  ];
}

async function loadOwnedTemplate(templateId: string, userId: string) {
  const template = await db.query.templates.findFirst({
    where: and(eq(templates.id, templateId), eq(templates.userId, userId)),
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
  const template = await loadOwnedTemplate(params.templateId, user.id);
  if (!template) {
    throw data("Template not found", { status: 404 });
  }
  const allExercises = await db
    .select()
    .from(exercises)
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
  const template = await loadOwnedTemplate(params.templateId, user.id);
  if (!template) {
    throw data("Template not found", { status: 404 });
  }

  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "rename") {
    const result = renameSchema.safeParse({ name: formData.get("name") });
    if (!result.success) {
      return data({ error: "Invalid name" }, { status: 400 });
    }
    await db
      .update(templates)
      .set({ name: result.data.name, updatedAt: new Date() })
      .where(eq(templates.id, template.id));
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
      template.templateExercises.reduce(
        (max, te) => Math.max(max, te.position),
        -1,
      ) + 1;

    await db.insert(templateExercises).values({
      templateId: template.id,
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
    return { ok: true };
  }

  if (intent === "removeExercise") {
    const templateExerciseId = String(formData.get("templateExerciseId"));
    await db
      .delete(templateExercises)
      .where(
        and(
          eq(templateExercises.id, templateExerciseId),
          eq(templateExercises.templateId, template.id),
        ),
      );
    return { ok: true };
  }

  if (intent === "move") {
    const templateExerciseId = String(formData.get("templateExerciseId"));
    const direction = formData.get("direction");
    const sorted = template.templateExercises;
    const index = sorted.findIndex((te) => te.id === templateExerciseId);
    const swapIndex = direction === "up" ? index - 1 : index + 1;
    if (index === -1 || swapIndex < 0 || swapIndex >= sorted.length) {
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
    return { ok: true };
  }

  if (intent === "delete") {
    await db.delete(templates).where(eq(templates.id, template.id));
    throw redirect("/templates");
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

  return (
    <fetcher.Form method="post" className="flex flex-col gap-3">
      <input type="hidden" name="intent" value="addExercise" />
      <div className="flex flex-col gap-2">
        <Label htmlFor="exerciseId">Exercise</Label>
        <Select
          name="exerciseId"
          value={exerciseId}
          onValueChange={setExerciseId}
        >
          <SelectTrigger id="exerciseId" className="w-full">
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
      </div>

      {selected?.exerciseType === "strength" ? (
        <div className="grid grid-cols-3 gap-3">
          <div className="flex flex-col gap-2">
            <Label htmlFor="targetSets">Sets</Label>
            <Input id="targetSets" name="targetSets" type="number" min={1} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="targetReps">Reps</Label>
            <Input id="targetReps" name="targetReps" type="number" min={1} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="targetWeight">Weight</Label>
            <Input
              id="targetWeight"
              name="targetWeight"
              type="number"
              min={0}
              step="0.5"
            />
          </div>
        </div>
      ) : null}

      {selected?.exerciseType === "cardio" ? (
        <div className="grid grid-cols-3 gap-3">
          <div className="flex flex-col gap-2">
            <Label htmlFor="targetDurationMinutes">Duration (min)</Label>
            <Input
              id="targetDurationMinutes"
              name="targetDurationMinutes"
              type="number"
              min={1}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="targetSpeed">Speed</Label>
            <Input
              id="targetSpeed"
              name="targetSpeed"
              type="number"
              min={0}
              step="0.1"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="targetResistance">Resistance</Label>
            <Input
              id="targetResistance"
              name="targetResistance"
              type="number"
              min={1}
            />
          </div>
        </div>
      ) : null}

      <Button type="submit" disabled={!exerciseId} className="self-start">
        Add exercise
      </Button>
    </fetcher.Form>
  );
}

export default function TemplateDetail({ loaderData }: Route.ComponentProps) {
  const { template, exercises: exerciseList } = loaderData;

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{template.name}</h1>
        <form method="post">
          <input type="hidden" name="intent" value="delete" />
          <Button type="submit" variant="destructive" size="sm">
            Delete template
          </Button>
        </form>
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Rename</CardTitle>
        </CardHeader>
        <CardContent>
          <form method="post" className="flex items-end gap-3">
            <input type="hidden" name="intent" value="rename" />
            <div className="flex flex-1 flex-col gap-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                name="name"
                defaultValue={template.name}
                required
              />
            </div>
            <Button type="submit">Save</Button>
          </form>
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Exercises</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {template.templateExercises.map((te, index) => (
            <div
              key={te.id}
              className="flex items-center justify-between rounded-lg border px-3 py-2"
            >
              <div>
                <p className="font-medium">{te.exercise.name}</p>
                <p className="text-muted-foreground text-sm">
                  {targetSummary(te)}
                </p>
              </div>
              <div className="flex items-center gap-1">
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
                    ↑
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
                    disabled={index === template.templateExercises.length - 1}
                  >
                    ↓
                  </Button>
                </form>
                <form method="post">
                  <input type="hidden" name="intent" value="removeExercise" />
                  <input
                    type="hidden"
                    name="templateExerciseId"
                    value={te.id}
                  />
                  <Button type="submit" variant="ghost" size="icon-sm">
                    ✕
                  </Button>
                </form>
              </div>
            </div>
          ))}
          {template.templateExercises.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No exercises yet. Add one below.
            </p>
          ) : null}

          <div className="mt-2 border-t pt-4">
            <AddExerciseForm exerciseList={exerciseList} />
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
