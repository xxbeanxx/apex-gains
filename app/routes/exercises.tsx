import { and, asc, eq } from "drizzle-orm";
import { useEffect, useRef, useState } from "react";
import { data, useFetcher } from "react-router";
import { z } from "zod";

import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { Checkbox } from "~/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "~/components/ui/dialog";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { Textarea } from "~/components/ui/textarea";
import { db } from "~/db/index.server";
import { equipment, exerciseEquipment, exercises } from "~/db/schema";

import type { Route } from "./+types/exercises";

export function meta() {
  return [{ title: "Exercises - Apex Gains" }];
}

const typeLabels: Record<string, string> = {
  strength: "Strength",
  cardio: "Cardio",
};

export async function loader() {
  const allEquipment = await db
    .select()
    .from(equipment)
    .orderBy(asc(equipment.name));

  const allExercises = await db.query.exercises.findMany({
    orderBy: asc(exercises.name),
    with: { equipmentLinks: { with: { equipment: true } } },
  });

  return { equipment: allEquipment, exercises: allExercises };
}

const addEquipmentSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
});

const toggleSchema = z.object({
  exerciseId: z.uuid(),
  equipmentId: z.uuid(),
  checked: z.enum(["true", "false"]),
});

const exerciseDetailsSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
  exerciseType: z.enum(["strength", "cardio"]),
  muscleGroup: z
    .string()
    .trim()
    .max(50)
    .optional()
    .transform((v) => (v ? v : undefined)),
  description: z
    .string()
    .trim()
    .max(1000)
    .optional()
    .transform((v) => (v ? v : undefined)),
});

export async function action({ request }: Route.ActionArgs) {
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "addEquipment") {
    const result = addEquipmentSchema.safeParse({ name: formData.get("name") });
    if (!result.success) {
      return data(
        { error: result.error.issues[0]?.message ?? "Invalid name" },
        { status: 400 },
      );
    }
    await db
      .insert(equipment)
      .values({ name: result.data.name })
      .onConflictDoNothing({ target: equipment.name });
    return { ok: true };
  }

  if (intent === "deleteEquipment") {
    const id = String(formData.get("equipmentId"));
    await db.delete(equipment).where(eq(equipment.id, id));
    return { ok: true };
  }

  if (intent === "toggleExerciseEquipment") {
    const raw = Object.fromEntries(formData);
    const result = toggleSchema.safeParse(raw);
    if (!result.success) {
      return data({ error: "Invalid toggle" }, { status: 400 });
    }
    const { exerciseId, equipmentId } = result.data;
    if (result.data.checked === "true") {
      await db
        .insert(exerciseEquipment)
        .values({ exerciseId, equipmentId })
        .onConflictDoNothing();
    } else {
      await db
        .delete(exerciseEquipment)
        .where(
          and(
            eq(exerciseEquipment.exerciseId, exerciseId),
            eq(exerciseEquipment.equipmentId, equipmentId),
          ),
        );
    }
    return { ok: true };
  }

  if (intent === "createExercise") {
    const raw = Object.fromEntries(formData);
    const result = exerciseDetailsSchema.safeParse(raw);
    if (!result.success) {
      return data(
        { error: result.error.issues[0]?.message ?? "Invalid exercise" },
        { status: 400 },
      );
    }
    const existing = await db.query.exercises.findFirst({
      where: eq(exercises.name, result.data.name),
    });
    if (existing) {
      return data(
        { error: "An exercise with this name already exists" },
        { status: 400 },
      );
    }
    await db.insert(exercises).values({
      name: result.data.name,
      exerciseType: result.data.exerciseType,
      muscleGroup: result.data.muscleGroup ?? null,
      description: result.data.description ?? null,
    });
    return { ok: true };
  }

  if (intent === "updateExercise") {
    const exerciseId = String(formData.get("exerciseId"));
    const raw = Object.fromEntries(formData);
    const result = exerciseDetailsSchema.safeParse(raw);
    if (!result.success) {
      return data(
        { error: result.error.issues[0]?.message ?? "Invalid exercise" },
        { status: 400 },
      );
    }
    const existing = await db.query.exercises.findFirst({
      where: eq(exercises.name, result.data.name),
    });
    if (existing && existing.id !== exerciseId) {
      return data(
        { error: "An exercise with this name already exists" },
        { status: 400 },
      );
    }
    await db
      .update(exercises)
      .set({
        name: result.data.name,
        exerciseType: result.data.exerciseType,
        muscleGroup: result.data.muscleGroup ?? null,
        description: result.data.description ?? null,
      })
      .where(eq(exercises.id, exerciseId));
    return { ok: true };
  }

  return data({ error: "Unknown action" }, { status: 400 });
}

type EquipmentOption = { id: string; name: string };
type ExerciseWithEquipment = {
  id: string;
  name: string;
  exerciseType: string;
  muscleGroup: string | null;
  description: string | null;
  equipmentLinks: { equipment: EquipmentOption }[];
};

function ExerciseDetailsFields({
  defaultValues,
}: {
  defaultValues?: {
    name: string;
    exerciseType: string;
    muscleGroup: string | null;
    description: string | null;
  };
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        <Label htmlFor="name">Name</Label>
        <Input
          id="name"
          name="name"
          defaultValue={defaultValues?.name}
          placeholder="Cable Crossover"
          required
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="exerciseType">Type</Label>
        <Select
          name="exerciseType"
          defaultValue={defaultValues?.exerciseType ?? "strength"}
        >
          <SelectTrigger id="exerciseType" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="strength">Strength</SelectItem>
            <SelectItem value="cardio">Cardio</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="muscleGroup">Muscle group</Label>
        <Input
          id="muscleGroup"
          name="muscleGroup"
          defaultValue={defaultValues?.muscleGroup ?? ""}
          placeholder="chest"
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          name="description"
          defaultValue={defaultValues?.description ?? ""}
          placeholder="How to perform this exercise, form cues, etc."
          rows={3}
        />
      </div>
    </div>
  );
}

function ExerciseEditorDialog({
  exercise,
  allEquipment,
}: {
  exercise: ExerciseWithEquipment;
  allEquipment: EquipmentOption[];
}) {
  const fetcher = useFetcher();
  const linkedIds = new Set(exercise.equipmentLinks.map((l) => l.equipment.id));

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          Edit
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{exercise.name}</DialogTitle>
        </DialogHeader>
        <fetcher.Form method="post" className="flex flex-col gap-3">
          <input type="hidden" name="intent" value="updateExercise" />
          <input type="hidden" name="exerciseId" value={exercise.id} />
          <ExerciseDetailsFields defaultValues={exercise} />
          {fetcher.data && "error" in fetcher.data ? (
            <p className="text-destructive text-sm">{fetcher.data.error}</p>
          ) : null}
          <Button type="submit" className="self-start">
            Save
          </Button>
        </fetcher.Form>

        <div className="mt-2 flex flex-col gap-3 border-t pt-4">
          <p className="text-sm font-medium">Equipment</p>
          {allEquipment.map((eq) => (
            <EquipmentCheckboxRow
              key={eq.id}
              exerciseId={exercise.id}
              equipmentId={eq.id}
              name={eq.name}
              defaultChecked={linkedIds.has(eq.id)}
            />
          ))}
          {allEquipment.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No equipment yet. Add some above first.
            </p>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function EquipmentCheckboxRow({
  exerciseId,
  equipmentId,
  name,
  defaultChecked,
}: {
  exerciseId: string;
  equipmentId: string;
  name: string;
  defaultChecked: boolean;
}) {
  const fetcher = useFetcher();
  const [checked, setChecked] = useState(defaultChecked);

  return (
    <label className="flex items-center gap-2 text-sm">
      <Checkbox
        checked={checked}
        onCheckedChange={(value) => {
          const isChecked = value === true;
          setChecked(isChecked);
          fetcher.submit(
            {
              intent: "toggleExerciseEquipment",
              exerciseId,
              equipmentId,
              checked: String(isChecked),
            },
            { method: "post" },
          );
        }}
      />
      {name}
    </label>
  );
}

function NewExerciseForm() {
  const fetcher = useFetcher();
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data && !("error" in fetcher.data)) {
      formRef.current?.reset();
    }
  }, [fetcher.state, fetcher.data]);

  return (
    <fetcher.Form
      ref={formRef}
      method="post"
      className="flex flex-col gap-3"
    >
      <input type="hidden" name="intent" value="createExercise" />
      <ExerciseDetailsFields />
      {fetcher.data && "error" in fetcher.data ? (
        <p className="text-destructive text-sm">{fetcher.data.error}</p>
      ) : null}
      <Button type="submit" className="self-start">
        Create exercise
      </Button>
    </fetcher.Form>
  );
}

export default function Exercises({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const { equipment: equipmentList, exercises: exerciseList } = loaderData;

  const byType = new Map<string, ExerciseWithEquipment[]>();
  for (const exercise of exerciseList) {
    const list = byType.get(exercise.exerciseType) ?? [];
    list.push(exercise);
    byType.set(exercise.exerciseType, list);
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="text-2xl font-bold">Exercise Library</h1>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Equipment</CardTitle>
            <p className="text-muted-foreground text-sm">
              Add equipment you have, then link it to exercises below. An
              exercise can use more than one - e.g. Bicep Curl on both the
              BowFlex and free weights.
            </p>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {equipmentList.map((eq) => (
                <form key={eq.id} method="post" className="inline-flex">
                  <input type="hidden" name="intent" value="deleteEquipment" />
                  <input type="hidden" name="equipmentId" value={eq.id} />
                  <Badge variant="secondary" className="gap-1.5 pr-1">
                    {eq.name}
                    <button
                      type="submit"
                      className="text-muted-foreground hover:text-foreground"
                      aria-label={`Remove ${eq.name}`}
                    >
                      ✕
                    </button>
                  </Badge>
                </form>
              ))}
              {equipmentList.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  No equipment yet. Add your first one below.
                </p>
              ) : null}
            </div>

            <form method="post" className="mt-4 flex items-end gap-3">
              <input type="hidden" name="intent" value="addEquipment" />
              <div className="flex flex-1 flex-col gap-2 sm:max-w-xs">
                <Label htmlFor="name">Add equipment</Label>
                <Input
                  id="name"
                  name="name"
                  placeholder="Free Weights"
                  required
                />
              </div>
              <Button type="submit">Add</Button>
            </form>
            {actionData && "error" in actionData ? (
              <p className="text-destructive mt-2 text-sm">
                {actionData.error}
              </p>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>New exercise</CardTitle>
            <p className="text-muted-foreground text-sm">
              Equipment can be linked afterward from the exercise's Edit
              dialog below.
            </p>
          </CardHeader>
          <CardContent>
            <NewExerciseForm />
          </CardContent>
        </Card>
      </div>

      {["strength", "cardio"].map((type) => {
        const list = byType.get(type) ?? [];
        if (list.length === 0) return null;
        return (
          <div key={type} className="mt-8">
            <h2 className="text-lg font-semibold">{typeLabels[type]}</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {list.map((exercise) => (
                <Card key={exercise.id}>
                  <CardHeader>
                    <CardTitle className="text-base">
                      {exercise.name}
                    </CardTitle>
                    {exercise.muscleGroup ? (
                      <p className="text-muted-foreground text-sm">
                        {exercise.muscleGroup}
                      </p>
                    ) : null}
                  </CardHeader>
                  <CardContent className="flex flex-col gap-3">
                    {exercise.description ? (
                      <p className="text-sm">{exercise.description}</p>
                    ) : null}
                    <div className="flex flex-wrap gap-1.5">
                      {exercise.equipmentLinks.map((link) => (
                        <Badge key={link.equipment.id} variant="secondary">
                          {link.equipment.name}
                        </Badge>
                      ))}
                      {exercise.equipmentLinks.length === 0 ? (
                        <span className="text-muted-foreground text-xs">
                          No equipment linked
                        </span>
                      ) : null}
                    </div>
                    <ExerciseEditorDialog
                      exercise={exercise}
                      allEquipment={equipmentList}
                    />
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        );
      })}
    </main>
  );
}
