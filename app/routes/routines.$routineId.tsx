import {
  ArrowDownIcon,
  ArrowUpIcon,
  CalendarPlusIcon,
  MoonIcon,
  PowerIcon,
  RotateCcwIcon,
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
import { loggerContext } from "~/lib/logger.server";
import { getRoutinesRepository } from "~/repositories/routines-repository.server";
import { getTemplatesRepository } from "~/repositories/templates-repository.server";

import type { Route } from "./+types/routines.$routineId";

export function meta({ loaderData }: Route.MetaArgs) {
  return [
    { title: `${loaderData?.routine.name ?? "Routine"} - Apex Gains` },
  ];
}

export async function loader({ params, context }: Route.LoaderArgs) {
  const user = context.get(userContext)!;
  const routinesRepository = await getRoutinesRepository();
  const routine = await routinesRepository.findVisibleForUser(
    user.id,
    params.routineId,
  );
  if (!routine) {
    throw data("Routine not found", { status: 404 });
  }
  const templatesRepository = await getTemplatesRepository();
  const visibleTemplates = (
    await templatesRepository.listForUser(user.id, user.showSampleData)
  ).sort((a, b) => a.name.localeCompare(b.name));
  return { routine, templates: visibleTemplates };
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
  const routineId = params.routineId;
  const routinesRepository = await getRoutinesRepository();

  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "delete") {
    const outcome = await routinesRepository.delete(user.id, routineId);
    if (outcome.outcome === "not-found") {
      throw data("Routine not found", { status: 404 });
    }
    if (outcome.outcome === "sample-routine") {
      return data(
        { error: "Sample routines can't be deleted.", intent: "delete" },
        { status: 400 },
      );
    }
    context
      .get(loggerContext)
      .info({ userId: user.id, routineId }, "routine deleted");
    throw redirect("/routines");
  }

  if (intent === "revert") {
    const outcome = await routinesRepository.revert(user.id, routineId);
    if (outcome.outcome === "not-found") {
      throw data("Routine not found", { status: 404 });
    }
    if (outcome.outcome === "nothing-to-revert") {
      return data(
        { error: "Nothing to revert", intent: "revert" },
        { status: 400 },
      );
    }
    throw redirect(`/routines/${outcome.forkedFromId}`);
  }

  if (intent === "rename") {
    const result = renameSchema.safeParse({ name: formData.get("name") });
    if (!result.success) {
      return data(
        { error: "Invalid name", intent: "rename" },
        { status: 400 },
      );
    }
    const outcome = await routinesRepository.rename(
      user.id,
      routineId,
      result.data.name,
    );
    if (outcome.outcome === "not-found") {
      throw data("Routine not found", { status: 404 });
    }
    if (outcome.forkedRoutineId) {
      throw redirect(`/routines/${outcome.forkedRoutineId}`);
    }
    return { ok: true };
  }

  if (intent === "reanchor") {
    const result = reanchorSchema.safeParse({
      anchorDate: formData.get("anchorDate"),
    });
    if (!result.success) {
      return data(
        { error: "Invalid date", intent: "reanchor" },
        { status: 400 },
      );
    }
    const outcome = await routinesRepository.reanchor(
      user.id,
      routineId,
      result.data.anchorDate,
    );
    if (outcome.outcome === "not-found") {
      throw data("Routine not found", { status: 404 });
    }
    if (outcome.forkedRoutineId) {
      throw redirect(`/routines/${outcome.forkedRoutineId}`);
    }
    return { ok: true };
  }

  if (intent === "activate") {
    const outcome = await routinesRepository.activate(user.id, routineId);
    if (outcome.outcome === "not-found") {
      throw data("Routine not found", { status: 404 });
    }
    context
      .get(loggerContext)
      .info({ userId: user.id, routineId }, "routine activated");
    if (outcome.forkedRoutineId) {
      throw redirect(`/routines/${outcome.forkedRoutineId}`);
    }
    return { ok: true };
  }

  if (intent === "deactivate") {
    const outcome = await routinesRepository.deactivate(user.id, routineId);
    if (outcome.outcome === "not-found") {
      throw data("Routine not found", { status: 404 });
    }
    context
      .get(loggerContext)
      .info({ userId: user.id, routineId }, "routine deactivated");
    if (outcome.forkedRoutineId) {
      throw redirect(`/routines/${outcome.forkedRoutineId}`);
    }
    return { ok: true };
  }

  if (intent === "addSlot") {
    const result = addSlotSchema.safeParse({
      templateId: formData.get("templateId"),
    });
    if (!result.success) {
      return data(
        { error: "Invalid slot", intent: "addSlot" },
        { status: 400 },
      );
    }
    const outcome = await routinesRepository.addSlot(
      user.id,
      routineId,
      result.data.templateId === "rest" ? null : result.data.templateId,
    );
    if (outcome.outcome === "not-found") {
      throw data("Routine not found", { status: 404 });
    }
    if (outcome.forkedRoutineId) {
      throw redirect(`/routines/${outcome.forkedRoutineId}`);
    }
    return { ok: true };
  }

  if (intent === "removeSlot") {
    const slotId = String(formData.get("slotId"));
    const outcome = await routinesRepository.removeSlot(
      user.id,
      routineId,
      slotId,
    );
    if (outcome.outcome === "not-found") {
      throw data("Routine not found", { status: 404 });
    }
    if (outcome.forkedRoutineId) {
      throw redirect(`/routines/${outcome.forkedRoutineId}`);
    }
    return { ok: true };
  }

  if (intent === "move") {
    const slotId = String(formData.get("slotId"));
    const direction = formData.get("direction") === "up" ? "up" : "down";
    const outcome = await routinesRepository.moveSlot(
      user.id,
      routineId,
      slotId,
      direction,
    );
    if (outcome.outcome === "not-found") {
      throw data("Routine not found", { status: 404 });
    }
    if (outcome.forkedRoutineId) {
      throw redirect(`/routines/${outcome.forkedRoutineId}`);
    }
    return { ok: true };
  }

  return data({ error: "Unknown action", intent: "unknown" }, { status: 400 });
}

export default function RoutineDetail({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const { routine, templates: templateList } = loaderData;

  const slotCount = routine.slots.length;
  const isSample = routine.userId === null;
  const isCustomized = routine.forkedFromId !== null;

  const errorFor = (matchIntent: string) =>
    actionData && "error" in actionData && actionData.intent === matchIntent
      ? actionData.error
      : undefined;
  const deleteError = errorFor("delete");
  const revertError = errorFor("revert");
  const renameError = errorFor("rename");
  const reanchorError = errorFor("reanchor");
  const addSlotError = errorFor("addSlot");

  return (
    <Page width="narrow">
      <PageHeader
        title={routine.name}
        badge={
          <>
            {routine.isActive ? (
              <Badge variant="brand">Active</Badge>
            ) : (
              <Badge variant="outline">Inactive</Badge>
            )}
            {isSample ? (
              <Badge variant="outline">Sample</Badge>
            ) : isCustomized ? (
              <Badge variant="secondary">Customized</Badge>
            ) : null}
          </>
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
            {isSample ? null : isCustomized ? (
              <form method="post" className="flex flex-col items-end gap-1.5">
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
                {revertError ? (
                  <p className="text-sm font-medium text-destructive">
                    {revertError}
                  </p>
                ) : null}
              </form>
            ) : (
              <form method="post" className="flex flex-col items-end gap-1.5">
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
                {deleteError ? (
                  <p className="text-sm font-medium text-destructive">
                    {deleteError}
                  </p>
                ) : null}
              </form>
            )}
          </>
        }
      />

      {isCustomized ? (
        <p className="mt-(--section-gap) text-sm text-muted-foreground">
          This is your customized copy of a sample routine. The original
          sample is unaffected.
        </p>
      ) : null}

      <div className="mt-(--section-gap) grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Rename</CardTitle>
            {isSample ? (
              <p className="text-sm text-muted-foreground">
                Editing a sample routine creates your own customized copy.
              </p>
            ) : null}
          </CardHeader>
          <CardContent>
            <form method="post">
              <input type="hidden" name="intent" value="rename" />
              <Field
                label="Name"
                error={renameError}
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
                error={reanchorError}
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
                error={addSlotError}
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
