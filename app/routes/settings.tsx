import { eq } from "drizzle-orm";
import { data } from "react-router";
import { z } from "zod";

import { userContext } from "~/auth/user-context";
import { Button } from "~/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { Label } from "~/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { db } from "~/db/index.server";
import { users } from "~/db/schema";

import type { Route } from "./+types/settings";

export function meta() {
  return [{ title: "Settings - Apex Gains" }];
}

const settingsSchema = z.object({
  weightUnit: z.enum(["lb", "kg"]),
  distanceUnit: z.enum(["km", "mi"]),
});

export async function loader({ context }: Route.LoaderArgs) {
  const user = context.get(userContext)!;
  return {
    weightUnit: user.weightUnit,
    distanceUnit: user.distanceUnit,
  };
}

export async function action({ request, context }: Route.ActionArgs) {
  const user = context.get(userContext)!;
  const formData = await request.formData();
  const result = settingsSchema.safeParse({
    weightUnit: formData.get("weightUnit"),
    distanceUnit: formData.get("distanceUnit"),
  });

  if (!result.success) {
    return data({ error: "Invalid unit selection." }, { status: 400 });
  }

  await db
    .update(users)
    .set({
      weightUnit: result.data.weightUnit,
      distanceUnit: result.data.distanceUnit,
      updatedAt: new Date(),
    })
    .where(eq(users.id, user.id));

  return { ok: true };
}

export default function Settings({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  return (
    <main className="mx-auto max-w-lg px-4 py-8">
      <h1 className="text-2xl font-bold">Settings</h1>
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Units</CardTitle>
          <CardDescription>
            Choose the unit for each measurement type. Weight and
            distance/speed can be set independently.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form method="post" className="flex flex-col gap-6">
            <div className="flex flex-col gap-2">
              <Label htmlFor="weightUnit">Weight</Label>
              <Select
                name="weightUnit"
                defaultValue={loaderData.weightUnit}
              >
                <SelectTrigger id="weightUnit" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="lb">Pounds (lb)</SelectItem>
                  <SelectItem value="kg">Kilograms (kg)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="distanceUnit">Distance &amp; speed</Label>
              <Select
                name="distanceUnit"
                defaultValue={loaderData.distanceUnit}
              >
                <SelectTrigger id="distanceUnit" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="km">Kilometers (km, km/h)</SelectItem>
                  <SelectItem value="mi">Miles (mi, mph)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {actionData && "error" in actionData ? (
              <p className="text-destructive text-sm">{actionData.error}</p>
            ) : null}
            {actionData && "ok" in actionData ? (
              <p className="text-sm text-green-600">Saved.</p>
            ) : null}

            <Button type="submit" className="self-start">
              Save
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
