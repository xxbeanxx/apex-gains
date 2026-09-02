import { desc, eq } from "drizzle-orm";
import { Link, data, redirect } from "react-router";
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
import { db } from "~/db/index.server";
import { templates } from "~/db/schema";

import type { Route } from "./+types/templates";

export function meta() {
  return [{ title: "Templates - Apex Gains" }];
}

const createTemplateSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
});

export async function loader({ context }: Route.LoaderArgs) {
  const user = context.get(userContext)!;
  const userTemplates = await db.query.templates.findMany({
    where: eq(templates.userId, user.id),
    orderBy: desc(templates.updatedAt),
    with: { templateExercises: true },
  });
  return { templates: userTemplates };
}

export async function action({ request, context }: Route.ActionArgs) {
  const user = context.get(userContext)!;
  const formData = await request.formData();
  const result = createTemplateSchema.safeParse({
    name: formData.get("name"),
  });

  if (!result.success) {
    return data(
      { error: result.error.issues[0]?.message ?? "Invalid name" },
      { status: 400 },
    );
  }

  const [template] = await db
    .insert(templates)
    .values({ userId: user.id, name: result.data.name })
    .returning();

  throw redirect(`/templates/${template.id}`);
}

export default function Templates({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="text-2xl font-bold">Templates</h1>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>New template</CardTitle>
        </CardHeader>
        <CardContent>
          <form method="post" className="flex items-end gap-3">
            <div className="flex flex-1 flex-col gap-2">
              <Label htmlFor="name">Name</Label>
              <Input id="name" name="name" placeholder="Push Day" required />
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

      <ul className="mt-6 flex flex-col gap-3">
        {loaderData.templates.map((template) => (
          <li key={template.id}>
            <Link
              to={`/templates/${template.id}`}
              className="flex items-center justify-between rounded-lg border px-4 py-3 hover:bg-muted"
            >
              <span className="font-medium">{template.name}</span>
              <span className="text-muted-foreground text-sm">
                {template.templateExercises.length} exercise
                {template.templateExercises.length === 1 ? "" : "s"}
              </span>
            </Link>
          </li>
        ))}
        {loaderData.templates.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No templates yet. Create one above.
          </p>
        ) : null}
      </ul>
    </main>
  );
}
