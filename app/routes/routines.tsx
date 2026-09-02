import { desc, eq } from "drizzle-orm";
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
import { db } from "~/db/index.server";
import { routines } from "~/db/schema";
import { todayDateString } from "~/lib/cycle";

import type { Route } from "./+types/routines";

export function meta() {
  return [{ title: "Routines - Apex Gains" }];
}

const createRoutineSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
});

export async function loader({ context }: Route.LoaderArgs) {
  const user = context.get(userContext)!;
  const userRoutines = await db.query.routines.findMany({
    where: eq(routines.userId, user.id),
    orderBy: desc(routines.updatedAt),
    with: { slots: true },
  });
  return { routines: userRoutines };
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

  throw redirect(`/routines/${routine.id}`);
}

export default function Routines({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  return (
    <main className="mx-auto max-w-7xl px-4 py-8">
      <h1 className="text-2xl font-bold">Routines</h1>
      <p className="text-muted-foreground mt-1 text-sm">
        A routine is a repeating cycle of days - each day is either one of
        your{" "}
        <Link to="/templates" className="underline">
          templates
        </Link>{" "}
        or a rest day. Only one routine can be active at a time; the active
        routine drives what shows up on the Today page.
      </p>

      <Card className="mt-6 max-w-md">
        <CardHeader>
          <CardTitle>New routine</CardTitle>
        </CardHeader>
        <CardContent>
          <form method="post" className="flex items-end gap-3">
            <div className="flex flex-1 flex-col gap-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                name="name"
                placeholder="Push/Pull/Legs"
                required
              />
            </div>
            <Button type="submit">Create</Button>
          </form>
          {actionData && "error" in actionData ? (
            <p className="text-destructive mt-2 text-sm">
              {actionData.error}
            </p>
          ) : null}
        </CardContent>
      </Card>

      <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {loaderData.routines.map((routine) => (
          <li key={routine.id}>
            <Link
              to={`/routines/${routine.id}`}
              className="flex h-full flex-col justify-between gap-2 rounded-lg border px-4 py-3 hover:bg-muted"
            >
              <span className="flex items-center gap-2 font-medium">
                {routine.name}
                {routine.isActive ? <Badge>Active</Badge> : null}
              </span>
              <span className="text-muted-foreground text-sm">
                {routine.slots.length} day
                {routine.slots.length === 1 ? "" : "s"}
              </span>
            </Link>
          </li>
        ))}
        {loaderData.routines.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No routines yet. Create one above.
          </p>
        ) : null}
      </ul>
    </main>
  );
}
