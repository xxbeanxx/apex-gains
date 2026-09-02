import { and, asc, eq } from "drizzle-orm";
import { useState } from "react";
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

  return data({ error: "Unknown action" }, { status: 400 });
}

type EquipmentOption = { id: string; name: string };
type ExerciseWithEquipment = {
  id: string;
  name: string;
  exerciseType: string;
  muscleGroup: string | null;
  equipmentLinks: { equipment: EquipmentOption }[];
};

function EquipmentEditorDialog({
  exercise,
  allEquipment,
}: {
  exercise: ExerciseWithEquipment;
  allEquipment: EquipmentOption[];
}) {
  const linkedIds = new Set(exercise.equipmentLinks.map((l) => l.equipment.id));

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          Edit equipment
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{exercise.name}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
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

      <Card className="mt-6">
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
              <Input id="name" name="name" placeholder="Free Weights" required />
            </div>
            <Button type="submit">Add</Button>
          </form>
          {actionData && "error" in actionData ? (
            <p className="text-destructive mt-2 text-sm">{actionData.error}</p>
          ) : null}
        </CardContent>
      </Card>

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
                    <EquipmentEditorDialog
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
