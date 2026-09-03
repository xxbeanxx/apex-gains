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
import { formatFullDate, isValidDateString, todayDateString } from "~/lib/cycle";
import { getBodyWeightLogsRepository } from "~/repositories/body-weight-logs-repository.server";

import type { Route } from "./+types/weight";

export function meta() {
  return [{ title: "Weight - Apex Gains" }];
}

const LOG_HISTORY_LIMIT = 180;

export async function loader({ context }: Route.LoaderArgs) {
  const user = context.get(userContext)!;
  const bodyWeightLogsRepository = await getBodyWeightLogsRepository();
  const logs = await bodyWeightLogsRepository.listRecentForUser(
    user.id,
    LOG_HISTORY_LIMIT,
  );

  return {
    weightUnit: user.weightUnit,
    todayStr: todayDateString(),
    logs,
  };
}

const logSchema = z.object({
  date: z.string().refine(isValidDateString),
  weight: z.coerce.number().positive(),
});

export async function action({ request, context }: Route.ActionArgs) {
  const user = context.get(userContext)!;
  const todayStr = todayDateString();
  const formData = await request.formData();
  const intent = formData.get("intent");

  const bodyWeightLogsRepository = await getBodyWeightLogsRepository();

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
    const dateStr = result.data.date <= todayStr ? result.data.date : todayStr;

    await bodyWeightLogsRepository.logForDate(
      user.id,
      dateStr,
      result.data.weight,
    );
    return { ok: true, intent: "log" } as const;
  }

  if (intent === "remove") {
    const logId = String(formData.get("logId"));
    await bodyWeightLogsRepository.removeOwnedByUser(user.id, logId);
    return { ok: true, intent: "remove" } as const;
  }

  return data({ error: "Unknown action" }, { status: 400 });
}

export default function Weight({ loaderData, actionData }: Route.ComponentProps) {
  const { weightUnit, todayStr, logs } = loaderData;
  const error =
    actionData && "error" in actionData ? actionData.error : undefined;

  // Oldest first for the trend line; `logs` arrives newest-first for the table.
  const ascending = [...logs].reverse();
  const series =
    ascending.length >= 2
      ? {
          exerciseId: "body-weight",
          exerciseName: "Body weight",
          metricLabel: "Body weight",
          unit: weightUnit,
          points: ascending.map((log) => ({
            date: log.date,
            value: Number(log.weight),
          })),
        }
      : null;

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
