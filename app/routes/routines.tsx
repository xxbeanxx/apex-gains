import { desc } from "drizzle-orm";
import { RepeatIcon } from "lucide-react";
import { Link, data, redirect } from "react-router";
import { z } from "zod";

import { userContext } from "~/auth/user-context";
import { Page, PageHeader, Section } from "~/components/layout/page";
import { Badge } from "~/components/ui/badge";
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
import { db } from "~/db/index.server";
import { routines } from "~/db/schema";
import { todayDateString } from "~/lib/cycle";
import { loggerContext } from "~/lib/logger.server";
import { sampleOrOwnRoutinesWhere } from "~/lib/sample-data.server";

import type { Route } from "./+types/routines";

export function meta() {
  return [{ title: "Routines - Apex Gains" }];
}

const createRoutineSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
});

export async function loader({ context }: Route.LoaderArgs) {
  const user = context.get(userContext)!;
  const visibleRoutines = await db.query.routines.findMany({
    where: sampleOrOwnRoutinesWhere(user.id, user.showSampleData),
    orderBy: desc(routines.updatedAt),
    with: { slots: true },
  });
  return { routines: visibleRoutines };
}

export async function action({ request, context }: Route.ActionArgs) {
  const user = context.get(userContext)!;
  const formData = await request.formData();
  const result = createRoutineSchema.safeParse({
    name: formData.get("name"),
  });

  if (!result.success) {
    return data(
      { error: result.error.issues[0]?.message ?? "Invalid name" },
      { status: 400 },
    );
  }

  const [routine] = await db
    .insert(routines)
    .values({
      userId: user.id,
      name: result.data.name,
      anchorDate: todayDateString(),
    })
    .returning();

  context
    .get(loggerContext)
    .info({ userId: user.id, routineId: routine.id }, "routine created");

  throw redirect(`/routines/${routine.id}`);
}

export default function Routines({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const error =
    actionData && "error" in actionData ? actionData.error : undefined;
  const { routines: routineList } = loaderData;

  return (
    <Page>
      <PageHeader
        title="Routines"
        description={
          <>
            A routine is a repeating cycle of days — each day is either one of
            your{" "}
            <Link
              to="/templates"
              className="font-medium text-foreground underline decoration-brand-strong decoration-2 underline-offset-4 hover:decoration-4"
            >
              templates
            </Link>{" "}
            or a rest day. Only one routine can be active at a time; the active
            routine drives what shows up on the Today page.
          </>
        }
      />

      <Card className="mt-(--section-gap) max-w-md">
        <CardHeader>
          <CardTitle>New routine</CardTitle>
        </CardHeader>
        <CardContent>
          <form method="post">
            <Field
              label="Name"
              error={error}
              action={
                <SubmitButton pendingLabel="Creating">Create</SubmitButton>
              }
            >
              <Input name="name" placeholder="Push/Pull/Legs" required />
            </Field>
          </form>
        </CardContent>
      </Card>

      <Section title="Your routines">
        {routineList.length === 0 ? (
          <EmptyState
            icon={RepeatIcon}
            title="No routines yet"
            description="Create one above, then add day-slots and set it active."
          />
        ) : (
          <ul className="stagger grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {routineList.map((routine) => (
              <li key={routine.id}>
                <Card interactive size="sm" className="relative h-full">
                  <CardContent className="flex h-full flex-col justify-between gap-2">
                    <span className="flex flex-wrap items-center gap-2">
                      <Link
                        to={`/routines/${routine.id}`}
                        className="font-heading font-medium after:absolute after:inset-0 after:content-['']"
                      >
                        {routine.name}
                      </Link>
                      {routine.isActive ? (
                        <Badge variant="brand">Active</Badge>
                      ) : null}
                      {routine.userId === null ? (
                        <Badge variant="outline">Sample</Badge>
                      ) : routine.forkedFromId !== null ? (
                        <Badge variant="secondary">Customized</Badge>
                      ) : null}
                    </span>
                    <span className="text-sm text-muted-foreground tabular-nums">
                      {routine.slots.length} day
                      {routine.slots.length === 1 ? "" : "s"}
                    </span>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </Page>
  );
}
