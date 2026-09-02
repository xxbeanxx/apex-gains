import { eq } from "drizzle-orm";
import { CheckCircle2Icon } from "lucide-react";
import { data } from "react-router";
import { z } from "zod";

import { userContext } from "~/auth/user-context";
import { Page, PageHeader } from "~/components/layout/page";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { Field } from "~/components/ui/field";
import { SubmitButton } from "~/components/ui/submit-button";
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
  const error =
    actionData && "error" in actionData ? actionData.error : undefined;

  return (
    <Page width="prose">
      <PageHeader
        title="Settings"
        description="Preferences that apply across every workout you log."
      />

      <Card className="mt-(--section-gap)">
        <CardHeader>
          <CardTitle>Units</CardTitle>
          <CardDescription>
            Choose the unit for each measurement type. Weight and
            distance/speed can be set independently.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form method="post" className="flex flex-col gap-6">
            <Field label="Weight" error={error}>
              {({ id, describedBy }) => (
                <Select name="weightUnit" defaultValue={loaderData.weightUnit}>
                  <SelectTrigger
                    id={id}
                    aria-describedby={describedBy}
                    className="w-full"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="lb">Pounds (lb)</SelectItem>
                    <SelectItem value="kg">Kilograms (kg)</SelectItem>
                  </SelectContent>
                </Select>
              )}
            </Field>

            <Field label="Distance & speed">
              {({ id }) => (
                <Select
                  name="distanceUnit"
                  defaultValue={loaderData.distanceUnit}
                >
                  <SelectTrigger id={id} className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="km">Kilometers (km, km/h)</SelectItem>
                    <SelectItem value="mi">Miles (mi, mph)</SelectItem>
                  </SelectContent>
                </Select>
              )}
            </Field>

            {/* Both outcomes land in one live region so a screen reader hears
                the result of saving without moving focus. */}
            <div aria-live="polite" className="empty:hidden">
              {actionData && "ok" in actionData ? (
                <p className="animate-fade-in flex items-center gap-1.5 text-sm font-medium text-success">
                  <CheckCircle2Icon className="size-4" aria-hidden="true" />
                  Saved.
                </p>
              ) : null}
            </div>

            <SubmitButton pendingLabel="Saving" className="self-start">
              Save
            </SubmitButton>
          </form>
        </CardContent>
      </Card>
    </Page>
  );
}
