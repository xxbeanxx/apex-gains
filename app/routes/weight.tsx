import { CheckCircle2Icon, ScaleIcon, XIcon } from "lucide-react";
import { data } from "react-router";
import { z } from "zod";

import { userContext } from "~/auth/user-context";
import { ExerciseProgressChart } from "~/components/history/exercise-progress-chart";
import { Page, PageHeader, Section } from "~/components/layout/page";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { DateOnly } from "~/domain/values/date-only";
import { formatFullDate } from "~/lib/format";

import {
  bodyWeightServiceContext,
  progressServiceContext,
} from "~/lib/nest-bridge.server";

import type { Route } from "./+types/weight";

export function meta() {
  return [{ title: "Weight - Apex Gains" }];
}

export async function loader({ context }: Route.LoaderArgs) {
  const athlete = context.get(userContext)!;
  const progressService = context.get(progressServiceContext);
  const log = await progressService.bodyWeightLog(athlete);

  return {
    weightUnit: log.unit,
    todayStr: DateOnly.today().value,
    logs: log.entries,
    series: log.series,
  };
}

const logSchema = z.object({
  date: z.string().refine(DateOnly.isValid),
  weight: z.coerce.number().positive(),
});

export async function action({ request, context }: Route.ActionArgs) {
  const athlete = context.get(userContext)!;
  const today = DateOnly.today();
  const formData = await request.formData();
  const intent = formData.get("intent");

  const bodyWeightService = context.get(bodyWeightServiceContext);

  if (intent === "log") {
    const result = logSchema.safeParse({
      date: formData.get("date"),
      weight: formData.get("weight"),
    });
    if (!result.success) {
      return data({ error: "Enter a valid date and weight." }, { status: 400 });
    }
    // Clamp instead of rejecting: a stale form (left open since yesterday)
    // should still log against today rather than fail outright.
    const date = DateOnly.parse(result.data.date).atMost(today);

    // The number is in whatever unit the athlete has chosen; the service
    // converts it to canonical storage.
    await bodyWeightService.record(athlete, date, result.data.weight);
    return { ok: true, intent: "log" } as const;
  }

  if (intent === "remove") {
    const date = DateOnly.tryParse(String(formData.get("date")));
    if (!date) {
      return data({ error: "Unknown weigh-in" }, { status: 400 });
    }
    await bodyWeightService.remove(
      athlete,
      date,
      String(formData.get("logId")),
    );
    return { ok: true, intent: "remove" } as const;
  }

  return data({ error: "Unknown action" }, { status: 400 });
}

export default function Weight({ loaderData, actionData }: Route.ComponentProps) {
  const { weightUnit, todayStr, logs, series } = loaderData;
  const error =
    actionData && "error" in actionData ? actionData.error : undefined;

  return (
    <Page>
      <PageHeader
        title="Weight"
        description="Log your body weight and watch the trend over time."
      />

      <Section title="Log weight">
        <Card>
          <CardContent>
            <form method="post" className="flex flex-wrap items-end gap-4">
              <input type="hidden" name="intent" value="log" />
              <Field label="Date" className="w-40">
                {({ id, describedBy }) => (
                  <Input
                    id={id}
                    aria-describedby={describedBy}
                    name="date"
                    type="date"
                    defaultValue={todayStr}
                    max={todayStr}
                    required
                  />
                )}
              </Field>
              <Field
                label={`Weight (${weightUnit})`}
                error={error}
                className="w-40"
              >
                <Input name="weight" type="number" step="0.1" min="0" required />
              </Field>
              <SubmitButton match={{ intent: "log" }} pendingLabel="Saving">
                Save
              </SubmitButton>
            </form>

            <div aria-live="polite" className="empty:hidden">
              {actionData && "ok" in actionData && actionData.intent === "log" ? (
                <p className="mt-3 flex items-center gap-1.5 text-sm font-medium text-success">
                  <CheckCircle2Icon className="size-4" aria-hidden="true" />
                  Saved.
                </p>
              ) : null}
            </div>
          </CardContent>
        </Card>
      </Section>

      {series ? (
        <Section title="Trend">
          <Card>
            <CardHeader>
              <CardTitle>Body weight</CardTitle>
            </CardHeader>
            <CardContent>
              <ExerciseProgressChart series={series} />
            </CardContent>
          </Card>
        </Section>
      ) : null}

      <Section title="History">
        {logs.length === 0 ? (
          <EmptyState
            icon={ScaleIcon}
            title="No weigh-ins yet"
            description="Log your weight above and it will show up here."
          />
        ) : (
          <Card>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Weight</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell>{formatFullDate(log.date)}</TableCell>
                      <TableCell className="tabular-nums">
                        {log.weight} {weightUnit}
                      </TableCell>
                      <TableCell>
                        <form method="post">
                          <input type="hidden" name="intent" value="remove" />
                          <input type="hidden" name="date" value={log.date} />
                          <input type="hidden" name="logId" value={log.id} />
                          <Button
                            type="submit"
                            variant="ghost"
                            size="icon-sm"
                            className="hover:bg-destructive/10 hover:text-destructive"
                          >
                            <XIcon aria-hidden="true" />
                            <span className="sr-only">
                              Remove weigh-in for {formatFullDate(log.date)}
                            </span>
                          </Button>
                        </form>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </Section>
    </Page>
  );
}
