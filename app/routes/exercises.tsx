import { and, asc, eq } from "drizzle-orm";
import {
  DumbbellIcon,
  PencilIcon,
  PlusIcon,
  RotateCcwIcon,
  XIcon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { data, useFetcher } from "react-router";
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
import { Checkbox } from "~/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "~/components/ui/dialog";
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
import { Textarea } from "~/components/ui/textarea";
import { db } from "~/db/index.server";
import { equipment, exerciseEquipment, exercises } from "~/db/schema";
import {
  forkExerciseForUser,
  sampleOrOwnEquipmentWhere,
  sampleOrOwnExercisesWhere,
} from "~/lib/sample-data.server";

import type { Route } from "./+types/exercises";

export function meta() {
  return [{ title: "Exercises - Apex Gains" }];
}

const typeLabels: Record<string, string> = {
  strength: "Strength",
  cardio: "Cardio",
};

export async function loader({ context }: Route.LoaderArgs) {
  const user = context.get(userContext)!;

  const allEquipment = await db
    .select()
    .from(equipment)
    .where(sampleOrOwnEquipmentWhere(user.id, user.showSampleData))
    .orderBy(asc(equipment.name));

  const allExercises = await db.query.exercises.findMany({
    where: sampleOrOwnExercisesWhere(user.id, user.showSampleData),
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

export async function action({ request, context }: Route.ActionArgs) {
  const user = context.get(userContext)!;
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
      .values({ userId: user.id, name: result.data.name })
      .onConflictDoNothing({ target: equipment.name });
    return { ok: true };
  }

  if (intent === "deleteEquipment") {
    const id = String(formData.get("equipmentId"));
    await db
      .delete(equipment)
      .where(and(eq(equipment.id, id), eq(equipment.userId, user.id)));
    return { ok: true };
  }

  if (intent === "toggleExerciseEquipment") {
    const raw = Object.fromEntries(formData);
    const result = toggleSchema.safeParse(raw);
    if (!result.success) {
      return data({ error: "Invalid toggle" }, { status: 400 });
    }
    const { equipmentId } = result.data;

    await db.transaction(async (tx) => {
      const exercise = await tx.query.exercises.findFirst({
        where: eq(exercises.id, result.data.exerciseId),
      });
      if (!exercise) return;

      const exerciseId =
        exercise.userId === null
          ? (await forkExerciseForUser(tx, exercise, user.id)).id
          : exercise.id;

      if (result.data.checked === "true") {
        await tx
          .insert(exerciseEquipment)
          .values({ exerciseId, equipmentId })
          .onConflictDoNothing();
      } else {
        await tx
          .delete(exerciseEquipment)
          .where(
            and(
              eq(exerciseEquipment.exerciseId, exerciseId),
              eq(exerciseEquipment.equipmentId, equipmentId),
            ),
          );
      }
    });
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
      where: and(
        eq(exercises.userId, user.id),
        eq(exercises.name, result.data.name),
      ),
    });
    if (existing) {
      return data(
        { error: "An exercise with this name already exists" },
        { status: 400 },
      );
    }
    await db.insert(exercises).values({
      userId: user.id,
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

    const outcome = await db.transaction(async (tx) => {
      const exercise = await tx.query.exercises.findFirst({
        where: eq(exercises.id, exerciseId),
      });
      if (!exercise) return "not-found" as const;

      const target =
        exercise.userId === null
          ? await forkExerciseForUser(tx, exercise, user.id)
          : exercise;

      const existing = await tx.query.exercises.findFirst({
        where: and(
          eq(exercises.userId, user.id),
          eq(exercises.name, result.data.name),
        ),
      });
      if (existing && existing.id !== target.id) {
        return "conflict" as const;
      }

      await tx
        .update(exercises)
        .set({
          name: result.data.name,
          exerciseType: result.data.exerciseType,
          muscleGroup: result.data.muscleGroup ?? null,
          description: result.data.description ?? null,
        })
        .where(eq(exercises.id, target.id));
      return "ok" as const;
    });

    if (outcome === "conflict") {
      return data(
        { error: "An exercise with this name already exists" },
        { status: 400 },
      );
    }
    if (outcome === "not-found") {
      return data({ error: "Exercise not found" }, { status: 404 });
    }
    return { ok: true };
  }

  if (intent === "revertExercise") {
    const exerciseId = String(formData.get("exerciseId"));
    const exercise = await db.query.exercises.findFirst({
      where: and(eq(exercises.id, exerciseId), eq(exercises.userId, user.id)),
    });
    if (!exercise || !exercise.forkedFromId) {
      return data({ error: "Nothing to revert" }, { status: 400 });
    }
    try {
      await db.delete(exercises).where(eq(exercises.id, exercise.id));
    } catch {
      return data(
        {
          error:
            "This customization is used in a template or logged workout — remove it from those first.",
        },
        { status: 400 },
      );
    }
    return { ok: true };
  }

  return data({ error: "Unknown action" }, { status: 400 });
}

type EquipmentOption = { id: string; name: string; userId: string | null };
type ExerciseWithEquipment = {
  id: string;
  userId: string | null;
  forkedFromId: string | null;
  name: string;
  exerciseType: string;
  muscleGroup: string | null;
  description: string | null;
  equipmentLinks: { equipment: EquipmentOption }[];
};

function ExerciseDetailsFields({
  defaultValues,
  error,
}: {
  defaultValues?: {
    name: string;
    exerciseType: string;
    muscleGroup: string | null;
    description: string | null;
  };
  error?: string;
}) {
  // Every id here comes from `Field`'s `useId`, so rendering this block twice
  // on one page (the create form and an edit dialog) no longer produces
  // colliding ids or labels pointing at the wrong input.
  return (
    <div className="flex flex-col gap-4">
      <Field label="Name" error={error}>
        <Input
          name="name"
          defaultValue={defaultValues?.name}
          placeholder="Cable Crossover"
          required
        />
      </Field>
      <Field label="Type">
        {({ id }) => (
          <Select
            name="exerciseType"
            defaultValue={defaultValues?.exerciseType ?? "strength"}
          >
            <SelectTrigger id={id} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="strength">Strength</SelectItem>
              <SelectItem value="cardio">Cardio</SelectItem>
            </SelectContent>
          </Select>
        )}
      </Field>
      <Field label="Muscle group">
        <Input
          name="muscleGroup"
          defaultValue={defaultValues?.muscleGroup ?? ""}
          placeholder="chest"
        />
      </Field>
      <Field label="Description">
        <Textarea
          name="description"
          defaultValue={defaultValues?.description ?? ""}
          placeholder="How to perform this exercise, form cues, etc."
          rows={3}
        />
      </Field>
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
  const revertFetcher = useFetcher();
  const linkedIds = new Set(exercise.equipmentLinks.map((l) => l.equipment.id));
  const isCustomized = exercise.forkedFromId !== null;

  const error =
    fetcher.data && "error" in fetcher.data ? fetcher.data.error : undefined;
  const revertError =
    revertFetcher.data && "error" in revertFetcher.data
      ? revertFetcher.data.error
      : undefined;

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="relative z-10 self-start">
          <PencilIcon aria-hidden="true" />
          Edit
          <span className="sr-only"> {exercise.name}</span>
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{exercise.name}</DialogTitle>
        </DialogHeader>
        {isCustomized ? (
          <div className="flex flex-col gap-2 rounded-lg bg-muted px-3 py-2.5 text-sm">
            <p className="text-muted-foreground">
              This is your customized copy of a sample exercise. The
              original sample is unaffected.
            </p>
            <revertFetcher.Form method="post" className="flex flex-col gap-2">
              <input type="hidden" name="intent" value="revertExercise" />
              <input type="hidden" name="exerciseId" value={exercise.id} />
              {revertError ? (
                <p className="text-destructive">{revertError}</p>
              ) : null}
              <SubmitButton
                variant="outline"
                size="sm"
                pending={revertFetcher.state !== "idle"}
                pendingLabel="Reverting"
                className="self-start"
              >
                <RotateCcwIcon aria-hidden="true" />
                Revert to sample
              </SubmitButton>
            </revertFetcher.Form>
          </div>
        ) : null}
        <fetcher.Form method="post" className="flex flex-col gap-4">
          <input type="hidden" name="intent" value="updateExercise" />
          <input type="hidden" name="exerciseId" value={exercise.id} />
          <ExerciseDetailsFields defaultValues={exercise} error={error} />
          <SubmitButton
            pending={fetcher.state !== "idle"}
            pendingLabel="Saving exercise"
            className="self-start"
          >
            Save
          </SubmitButton>
        </fetcher.Form>

        <div className="flex flex-col gap-3 border-t border-border pt-4">
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
            <p className="text-sm text-muted-foreground">
              No equipment yet. Add some on the Exercise Library page first.
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
    <label className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm transition-colors duration-(--dur-fast) hover:bg-muted has-[:focus-visible]:bg-muted">
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

  const pending = fetcher.state !== "idle";
  const error =
    fetcher.data && "error" in fetcher.data ? fetcher.data.error : undefined;

  return (
    <fetcher.Form ref={formRef} method="post" className="flex flex-col gap-4">
      <input type="hidden" name="intent" value="createExercise" />
      <ExerciseDetailsFields error={error} />
      <SubmitButton
        pending={pending}
        pendingLabel="Creating exercise"
        variant="brand"
        className="self-start"
      >
        {pending ? null : <PlusIcon aria-hidden="true" />}
        Create exercise
      </SubmitButton>
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

  const error =
    actionData && "error" in actionData ? actionData.error : undefined;

  return (
    <Page>
      <PageHeader
        title="Exercise Library"
        description={`${exerciseList.length} movement${exerciseList.length === 1 ? "" : "s"} across ${equipmentList.length} piece${equipmentList.length === 1 ? "" : "s"} of equipment.`}
      />

      {/* items-start: let each card take its natural height instead of the
          shorter one stretching to match and leaving a void. */}
      <div className="mt-(--section-gap) grid gap-4 lg:grid-cols-2 lg:items-start">
        <Card>
          <CardHeader>
            <CardTitle>Equipment</CardTitle>
            <p className="text-sm text-muted-foreground">
              Add equipment you have, then link it to exercises below. An
              exercise can use more than one — e.g. Bicep Curl on both the
              BowFlex and free weights.
            </p>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {equipmentList.length > 0 ? (
              <ul className="flex flex-wrap gap-2">
                {equipmentList.map((eq) =>
                  eq.userId === null ? (
                    <li key={eq.id}>
                      <Badge variant="outline" className="h-6">
                        {eq.name}
                      </Badge>
                    </li>
                  ) : (
                    <li key={eq.id}>
                      <form method="post" className="inline-flex">
                        <input
                          type="hidden"
                          name="intent"
                          value="deleteEquipment"
                        />
                        <input
                          type="hidden"
                          name="equipmentId"
                          value={eq.id}
                        />
                        <Badge variant="secondary" className="h-6 gap-1 pr-1">
                          {eq.name}
                          {/* after:-inset-1 grows the hit area to 24px without
                              growing the glyph (WCAG 2.5.8 target size). */}
                          <button
                            type="submit"
                            className="relative flex size-4 items-center justify-center rounded-full text-muted-foreground transition-colors duration-(--dur-fast) after:absolute after:-inset-1 after:content-[''] hover:bg-destructive/15 hover:text-destructive"
                          >
                            <XIcon className="size-3" aria-hidden="true" />
                            <span className="sr-only">
                              Remove {eq.name} equipment
                            </span>
                          </button>
                        </Badge>
                      </form>
                    </li>
                  ),
                )}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">
                No equipment yet. Add your first one below.
              </p>
            )}

            <form method="post">
              <input type="hidden" name="intent" value="addEquipment" />
              <Field
                label="Add equipment"
                error={error}
                className="sm:max-w-sm"
                action={
                  <SubmitButton
                    match={{ intent: "addEquipment" }}
                    pendingLabel="Adding equipment"
                  >
                    Add
                  </SubmitButton>
                }
              >
                <Input name="name" placeholder="Free Weights" required />
              </Field>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>New exercise</CardTitle>
            <p className="text-sm text-muted-foreground">
              Equipment can be linked afterward from the exercise's Edit dialog
              below.
            </p>
          </CardHeader>
          <CardContent>
            <NewExerciseForm />
          </CardContent>
        </Card>
      </div>

      {exerciseList.length === 0 ? (
        <div className="mt-(--section-gap)">
          <EmptyState
            icon={DumbbellIcon}
            title="No exercises yet"
            description="Create your first movement with the form above."
          />
        </div>
      ) : null}

      {["strength", "cardio"].map((type) => {
        const list = byType.get(type) ?? [];
        if (list.length === 0) return null;
        return (
          <Section
            key={type}
            title={typeLabels[type]}
            description={`${list.length} exercise${list.length === 1 ? "" : "s"}`}
          >
            <ul className="stagger grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {list.map((exercise) => (
                <li key={exercise.id}>
                  <Card className="h-full">
                    <CardHeader>
                      <CardTitle className="flex flex-wrap items-center gap-1.5 text-base">
                        {exercise.name}
                        {exercise.userId === null ? (
                          <Badge variant="outline">Sample</Badge>
                        ) : exercise.forkedFromId !== null ? (
                          <Badge variant="secondary">Customized</Badge>
                        ) : null}
                      </CardTitle>
                      {exercise.muscleGroup ? (
                        <p className="text-sm text-muted-foreground">
                          {exercise.muscleGroup}
                        </p>
                      ) : null}
                    </CardHeader>
                    <CardContent className="flex flex-1 flex-col gap-4">
                      {exercise.description ? (
                        <p className="text-sm text-pretty text-muted-foreground">
                          {exercise.description}
                        </p>
                      ) : null}
                      <div className="mt-auto flex flex-col gap-4">
                        <div className="flex flex-wrap gap-1.5">
                          {exercise.equipmentLinks.map((link) => (
                            <Badge key={link.equipment.id} variant="secondary">
                              {link.equipment.name}
                            </Badge>
                          ))}
                          {exercise.equipmentLinks.length === 0 ? (
                            <span className="text-xs text-muted-foreground">
                              No equipment linked
                            </span>
                          ) : null}
                        </div>
                        <ExerciseEditorDialog
                          exercise={exercise}
                          allEquipment={equipmentList}
                        />
                      </div>
                    </CardContent>
                  </Card>
                </li>
              ))}
            </ul>
          </Section>
        );
      })}
    </Page>
  );
}
