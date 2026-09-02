import { and, asc, eq } from "drizzle-orm";
import { Link, data, redirect } from "react-router";
import { z } from "zod";

import { userContext } from "~/auth/user-context";
import { Badge } from "~/components/ui/badge";
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

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <div className="flex items-center justify-between">
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          {routine.name}
          {routine.isActive ? <Badge>Active</Badge> : null}
        </h1>
        <div className="flex gap-2">
          <form method="post">
            <input
              type="hidden"
              name="intent"
              value={routine.isActive ? "deactivate" : "activate"}
            />
            <Button type="submit" variant="outline" size="sm">
              {routine.isActive ? "Deactivate" : "Set active"}
            </Button>
          </form>
          <form method="post">
            <input type="hidden" name="intent" value="delete" />
            <Button type="submit" variant="destructive" size="sm">
              Delete routine
            </Button>
          </form>
        </div>
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
                defaultValue={routine.name}
                required
              />
            </div>
            <Button type="submit">Save</Button>
          </form>
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Anchor date</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground mb-3 text-sm">
            The day this routine's cycle starts counting from. Day 1 of the
            cycle falls on this date, and it repeats every {routine.slots.length || "N"}{" "}
            days from there.
          </p>
          <form method="post" className="flex items-end gap-3">
            <input type="hidden" name="intent" value="reanchor" />
            <div className="flex flex-1 flex-col gap-2">
              <Label htmlFor="anchorDate">Anchor date</Label>
              <Input
                id="anchorDate"
                name="anchorDate"
                type="date"
                defaultValue={routine.anchorDate}
                required
              />
            </div>
            <Button type="submit">Save</Button>
          </form>
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Days</CardTitle>
          <p className="text-muted-foreground text-sm">
            Each day is one of your templates or a rest day. Day 1 falls on
            the anchor date above and the cycle repeats every N days.
          </p>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {routine.slots.map((slot, index) => (
            <div
              key={slot.id}
              className="flex items-center justify-between rounded-lg border px-3 py-2"
            >
              <div>
                <p className="text-muted-foreground text-xs">
                  Day {index + 1}
                </p>
                <p className="font-medium">
                  {slot.template ? slot.template.name : "Rest"}
                </p>
              </div>
              <div className="flex items-center gap-1">
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
                    ↑
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
                    disabled={index === routine.slots.length - 1}
                  >
                    ↓
                  </Button>
                </form>
                <form method="post">
                  <input type="hidden" name="intent" value="removeSlot" />
                  <input type="hidden" name="slotId" value={slot.id} />
                  <Button type="submit" variant="ghost" size="icon-sm">
                    ✕
                  </Button>
                </form>
              </div>
            </div>
          ))}
          {routine.slots.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No days yet. Add one below.
            </p>
          ) : null}

          <form
            method="post"
            className="mt-2 flex items-end gap-3 border-t pt-4"
          >
            <input type="hidden" name="intent" value="addSlot" />
            <div className="flex flex-1 flex-col gap-2">
              <Label htmlFor="templateId">Add day</Label>
              <Select name="templateId" defaultValue="rest">
                <SelectTrigger id="templateId" className="w-full">
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
            </div>
            <Button type="submit">Add</Button>
          </form>
          {templateList.length === 0 ? (
            <p className="text-muted-foreground mt-2 text-sm">
              You don't have any templates yet -{" "}
              <Link to="/templates" className="underline">
                create one
              </Link>{" "}
              to add it as a day here.
            </p>
          ) : null}
        </CardContent>
      </Card>
    </main>
  );
}
