import { and, asc, eq } from "drizzle-orm";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  CalendarPlusIcon,
  MoonIcon,
  PowerIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";
import { Link, data, redirect } from "react-router";
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
import { routineSlots, routines, templates } from "~/db/schema";

import type { Route } from "./+types/routines.$routineId";

export function meta({ loaderData }: Route.MetaArgs) {
  return [
    { title: `${loaderData?.routine.name ?? "Routine"} - Apex Gains` },
  ];
}

async function loadOwnedRoutine(routineId: string, userId: string) {
  const routine = await db.query.routines.findFirst({
    where: and(eq(routines.id, routineId), eq(routines.userId, userId)),
    with: {
      slots: {
        orderBy: asc(routineSlots.position),
        with: { template: true },
      },
    },
  });
  return routine ?? null;
}

export async function loader({ params, context }: Route.LoaderArgs) {
  const user = context.get(userContext)!;
  const routine = await loadOwnedRoutine(params.routineId, user.id);
  if (!routine) {
    throw data("Routine not found", { status: 404 });
  }
  const userTemplates = await db
    .select()
    .from(templates)
    .where(eq(templates.userId, user.id))
    .orderBy(asc(templates.name));
  return { routine, templates: userTemplates };
}

const renameSchema = z.object({ name: z.string().trim().min(1).max(100) });
const reanchorSchema = z.object({
  anchorDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
const addSlotSchema = z.object({
  templateId: z.union([z.uuid(), z.literal("rest")]),
});

export async function action({ request, params, context }: Route.ActionArgs) {
  const user = context.get(userContext)!;
  const routine = await loadOwnedRoutine(params.routineId, user.id);
  if (!routine) {
    throw data("Routine not found", { status: 404 });
  }

  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "rename") {
    const result = renameSchema.safeParse({ name: formData.get("name") });
    if (!result.success) {
      return data({ error: "Invalid name" }, { status: 400 });
    }
    await db
      .update(routines)
      .set({ name: result.data.name, updatedAt: new Date() })
      .where(eq(routines.id, routine.id));
    return { ok: true };
  }

  if (intent === "reanchor") {
    const result = reanchorSchema.safeParse({
      anchorDate: formData.get("anchorDate"),
    });
    if (!result.success) {
      return data({ error: "Invalid date" }, { status: 400 });
    }
    await db
      .update(routines)
      .set({ anchorDate: result.data.anchorDate, updatedAt: new Date() })
      .where(eq(routines.id, routine.id));
    return { ok: true };
  }

  if (intent === "activate") {
    await db.transaction(async (tx) => {
      await tx
        .update(routines)
        .set({ isActive: false, updatedAt: new Date() })
        .where(eq(routines.userId, user.id));
      await tx
        .update(routines)
        .set({ isActive: true, updatedAt: new Date() })
        .where(eq(routines.id, routine.id));
    });
    return { ok: true };
  }

  if (intent === "deactivate") {
    await db
      .update(routines)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(routines.id, routine.id));
    return { ok: true };
  }

  if (intent === "addSlot") {
    const result = addSlotSchema.safeParse({
      templateId: formData.get("templateId"),
    });
    if (!result.success) {
      return data({ error: "Invalid slot" }, { status: 400 });
    }
    const nextPosition =
      routine.slots.reduce((max, slot) => Math.max(max, slot.position), -1) +
      1;
    await db.insert(routineSlots).values({
      routineId: routine.id,
      position: nextPosition,
      templateId:
        result.data.templateId === "rest" ? null : result.data.templateId,
    });
    return { ok: true };
  }

  if (intent === "removeSlot") {
    const slotId = String(formData.get("slotId"));
    const removed = routine.slots.find((s) => s.id === slotId);
    if (!removed) return { ok: true };

    await db.transaction(async (tx) => {
      await tx.delete(routineSlots).where(eq(routineSlots.id, slotId));
      const toShift = routine.slots
        .filter((s) => s.position > removed.position)
        .sort((a, b) => a.position - b.position);
      for (const slot of toShift) {
        await tx
          .update(routineSlots)
          .set({ position: slot.position - 1 })
          .where(eq(routineSlots.id, slot.id));
      }
    });
    return { ok: true };
  }

  if (intent === "move") {
    const slotId = String(formData.get("slotId"));
    const direction = formData.get("direction");
    const sorted = routine.slots;
    const index = sorted.findIndex((s) => s.id === slotId);
    const swapIndex = direction === "up" ? index - 1 : index + 1;
    if (index === -1 || swapIndex < 0 || swapIndex >= sorted.length) {
      return { ok: true };
    }
    const current = sorted[index];
    const swap = sorted[swapIndex];

    await db.transaction(async (tx) => {
      await tx
        .update(routineSlots)
        .set({ position: -1 })
        .where(eq(routineSlots.id, current.id));
      await tx
        .update(routineSlots)
        .set({ position: current.position })
        .where(eq(routineSlots.id, swap.id));
      await tx
        .update(routineSlots)
        .set({ position: swap.position })
        .where(eq(routineSlots.id, current.id));
    });
    return { ok: true };
  }

  if (intent === "delete") {
    await db.delete(routines).where(eq(routines.id, routine.id));
    throw redirect("/routines");
  }

  return data({ error: "Unknown action" }, { status: 400 });
}

export default function RoutineDetail({ loaderData }: Route.ComponentProps) {
  const { routine, templates: templateList } = loaderData;

  const slotCount = routine.slots.length;

  return (
    <Page width="narrow">
      <PageHeader
        title={routine.name}
        badge={
          routine.isActive ? (
            <Badge variant="brand">Active</Badge>
          ) : (
            <Badge variant="outline">Inactive</Badge>
          )
        }
        description={
          slotCount > 0
            ? `A ${slotCount}-day cycle that repeats from its anchor date.`
            : "An empty cycle. Add day-slots below to give it a shape."
        }
        actions={
          <>
            <form method="post">
              <input
                type="hidden"
                name="intent"
                value={routine.isActive ? "deactivate" : "activate"}
              />
              <SubmitButton
                variant={routine.isActive ? "outline" : "brand"}
                size="sm"
                match={{
                  intent: routine.isActive ? "deactivate" : "activate",
                }}
                pendingLabel="Updating routine"
              >
                <PowerIcon aria-hidden="true" />
                {routine.isActive ? "Deactivate" : "Set active"}
              </SubmitButton>
            </form>
            <form method="post">
              <input type="hidden" name="intent" value="delete" />
              <SubmitButton
                variant="destructive"
                size="sm"
                match={{ intent: "delete" }}
                pendingLabel="Deleting routine"
              >
                <Trash2Icon aria-hidden="true" />
                Delete routine
              </SubmitButton>
            </form>
          </>
        }
      />

      <div className="mt-(--section-gap) grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Rename</CardTitle>
          </CardHeader>
          <CardContent>
            <form method="post">
              <input type="hidden" name="intent" value="rename" />
              <Field
                label="Name"
                action={
                  <SubmitButton
                    match={{ intent: "rename" }}
                    pendingLabel="Saving"
                  >
                    Save
                  </SubmitButton>
                }
              >
                <Input name="name" defaultValue={routine.name} required />
              </Field>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Anchor date</CardTitle>
          </CardHeader>
          <CardContent>
            <form method="post">
              <input type="hidden" name="intent" value="reanchor" />
              <Field
                label="Anchor date"
                description={`Day 1 of the cycle falls on this date, and it repeats every ${slotCount || "N"} days from there.`}
                action={
                  <SubmitButton
                    match={{ intent: "reanchor" }}
                    pendingLabel="Saving"
                  >
                    Save
                  </SubmitButton>
                }
              >
                <Input
                  name="anchorDate"
                  type="date"
                  defaultValue={routine.anchorDate}
                  required
                />
              </Field>
            </form>
          </CardContent>
        </Card>
      </div>

      <Section
        title="Days"
        description="Each day is one of your templates or a rest day, in cycle order."
      >
        {slotCount === 0 ? (
          <EmptyState
            icon={CalendarPlusIcon}
            title="No days yet"
            description="Add the first day-slot using the form below."
            compact
          />
        ) : (
          <ol className="grid gap-3 lg:grid-cols-2">
            {routine.slots.map((slot, index) => {
              const isRest = !slot.template;
              return (
                <li
                  key={slot.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-3 py-2.5 shadow-sm shadow-black/[0.03] transition-colors duration-(--dur) hover:border-ring/30 dark:shadow-black/20"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span
                      aria-hidden="true"
                      className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-xs font-semibold text-muted-foreground tabular-nums"
                    >
                      {index + 1}
                    </span>
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground">
                        Day {index + 1}
                      </p>
                      <p className="flex items-center gap-1.5 truncate font-medium">
                        {isRest ? (
                          <>
                            <MoonIcon
                              className="size-3.5 text-muted-foreground"
                              aria-hidden="true"
                            />
                            Rest
                          </>
                        ) : (
                          slot.template!.name
                        )}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-0.5">
                    <form method="post">
                      <input type="hidden" name="intent" value="move" />
                      <input type="hidden" name="slotId" value={slot.id} />
                      <input type="hidden" name="direction" value="up" />
                      <Button
                        type="submit"
                        variant="ghost"
                        size="icon-sm"
                        disabled={index === 0}
                      >
                        <ArrowUpIcon aria-hidden="true" />
                        <span className="sr-only">Move day {index + 1} up</span>
                      </Button>
                    </form>
                    <form method="post">
                      <input type="hidden" name="intent" value="move" />
                      <input type="hidden" name="slotId" value={slot.id} />
                      <input type="hidden" name="direction" value="down" />
                      <Button
                        type="submit"
                        variant="ghost"
                        size="icon-sm"
                        disabled={index === slotCount - 1}
                      >
                        <ArrowDownIcon aria-hidden="true" />
                        <span className="sr-only">
                          Move day {index + 1} down
                        </span>
                      </Button>
                    </form>
                    <form method="post">
                      <input type="hidden" name="intent" value="removeSlot" />
                      <input type="hidden" name="slotId" value={slot.id} />
                      <Button
                        type="submit"
                        variant="ghost"
                        size="icon-sm"
                        className="hover:bg-destructive/10 hover:text-destructive"
                      >
                        <XIcon aria-hidden="true" />
                        <span className="sr-only">
                          Remove day {index + 1} from this routine
                        </span>
                      </Button>
                    </form>
                  </div>
                </li>
              );
            })}
          </ol>
        )}

        <Card className="max-w-xl">
          <CardHeader>
            <CardTitle>Add a day</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <form method="post">
              <input type="hidden" name="intent" value="addSlot" />
              <Field
                label="Day type"
                action={
                  <SubmitButton
                    match={{ intent: "addSlot" }}
                    pendingLabel="Adding day"
                  >
                    Add
                  </SubmitButton>
                }
              >
                {({ id }) => (
                  <Select name="templateId" defaultValue="rest">
                    <SelectTrigger id={id} className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="rest">Rest day</SelectItem>
                      {templateList.map((template) => (
                        <SelectItem key={template.id} value={template.id}>
                          {template.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </Field>
            </form>
            {templateList.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                You don't have any templates yet —{" "}
                <Link
                  to="/templates"
                  className="font-medium text-foreground underline decoration-brand-strong decoration-2 underline-offset-4 hover:decoration-4"
                >
                  create one
                </Link>{" "}
                to add it as a day here.
              </p>
            ) : null}
          </CardContent>
        </Card>
      </Section>
    </Page>
  );
}
