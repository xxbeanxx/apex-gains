import { Expose, Transform } from 'class-transformer';
import { IsNumber, IsPositive, IsUUID } from 'class-validator';
import { CheckCircle2Icon, ScaleIcon, XIcon } from 'lucide-react';
import { data, useFetcher } from 'react-router';

import { requireAthlete } from '~/auth/user-context';
import { ExerciseProgressChart } from '~/components/history/exercise-progress-chart';
import { Page, PageHeader, Section } from '~/components/layout/page';
import { Button } from '~/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';
import { EmptyState } from '~/components/ui/empty-state';
import { Field } from '~/components/ui/field';
import { Input } from '~/components/ui/input';
import { SubmitButton } from '~/components/ui/submit-button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '~/components/ui/table';
import { DateOnly } from '~/domain/values/date-only';
import { formatFullDate } from '~/lib/format';
import { intent } from '~/lib/intent';
import { dispatch, handled } from '~/lib/intent.server';
import { IsDateOnly, toNumber } from '~/lib/validate-form';

import { bodyWeightServiceContext, progressServiceContext } from '~/lib/nest-bridge.server';

import type { Route } from './+types/weight';

export function meta() {
  return [{ title: 'Weight - Apex Gains' }];
}

export const handle = { crumb: () => ({ label: 'Weight' }) };

export async function loader({ context }: Route.LoaderArgs) {
  const athlete = requireAthlete(context);
  const progressService = context.get(progressServiceContext);
  const log = await progressService.bodyWeightLog(athlete);

  return {
    weightUnit: log.unit,
    todayStr: DateOnly.today(new Date(), athlete.preferences.timezone).value,
    logs: log.entries,
    series: log.series,
  };
}

class LogWeightDto {
  @Expose()
  @IsDateOnly()
  readonly date!: string;

  @Expose()
  @Transform(toNumber())
  @IsNumber()
  @IsPositive()
  readonly weight!: number;
}

class RemoveWeightDto {
  @Expose()
  @IsDateOnly({ message: 'Unknown weigh-in' })
  readonly date!: string;

  @Expose()
  @IsUUID(undefined, { message: 'Unknown weigh-in' })
  readonly logId!: string;
}

const intents = {
  log: intent('log', LogWeightDto, { invalidMessage: 'Enter a valid date and weight.' }),
  remove: intent('remove', RemoveWeightDto),
};

export async function action({ request, context }: Route.ActionArgs) {
  const athlete = requireAthlete(context);
  const today = DateOnly.today(new Date(), athlete.preferences.timezone);
  const bodyWeightService = context.get(bodyWeightServiceContext);

  return dispatch(request, [
    handled(intents.log, async ({ date, weight }) => {
      // Clamp instead of rejecting: a stale form (left open since yesterday)
      // should still log against today rather than fail outright.
      // The number is in whatever unit the athlete has chosen; the service
      // converts it to canonical storage.
      await bodyWeightService.record(athlete, DateOnly.parse(date).atMost(today), weight);
      return { ok: true, intent: intents.log.name } as const;
    }),

    handled(intents.remove, async ({ date, logId }) => {
      await bodyWeightService.remove(athlete, DateOnly.parse(date), logId);
      return { ok: true, intent: intents.remove.name } as const;
    }),
  ]);
}

/** Its own fetcher, so removing one weigh-in hides only that row while its delete is in flight. */
function WeightHistoryRow({
  log,
  weightUnit,
}: {
  log: Route.ComponentProps['loaderData']['logs'][number];
  weightUnit: string;
}) {
  const fetcher = useFetcher();

  return (
    <TableRow hidden={fetcher.state !== 'idle'}>
      <TableCell>{formatFullDate(log.date)}</TableCell>
      <TableCell className="tabular-nums">
        {log.weight} {weightUnit}
      </TableCell>
      <TableCell>
        <fetcher.Form method="post">
          <input {...intents.remove.field} />
          <input type="hidden" name="date" value={log.date} />
          <input type="hidden" name="logId" value={log.id} />
          <Button type="submit" variant="ghost" size="icon-sm" className="hover:bg-destructive/10 hover:text-destructive">
            <XIcon aria-hidden="true" />
            <span className="sr-only">Remove weigh-in for {formatFullDate(log.date)}</span>
          </Button>
        </fetcher.Form>
      </TableCell>
    </TableRow>
  );
}

export default function Weight({ loaderData, actionData }: Route.ComponentProps) {
  const { weightUnit, todayStr, logs, series } = loaderData;
  const error = intents.log.errorIn(actionData) ?? intents.remove.errorIn(actionData);

  return (
    <Page>
      <PageHeader title="Weight" description="Log your body weight and watch the trend over time." />

      <Section title="Log weight">
        <Card>
          <CardContent>
            <form method="post" className="flex flex-wrap items-end gap-4">
              <input {...intents.log.field} />
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
              <Field label={`Weight (${weightUnit})`} error={error} className="w-40">
                <Input name="weight" type="number" step="0.1" min="0" required />
              </Field>
              <SubmitButton match={intents.log.match} pendingLabel="Saving">
                Save
              </SubmitButton>
            </form>

            <div aria-live="polite" className="empty:hidden">
              {intents.log.succeededIn(actionData) ? (
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
          <EmptyState icon={ScaleIcon} title="No weigh-ins yet" description="Log your weight above and it will show up here." />
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
                    <WeightHistoryRow key={log.id} log={log} weightUnit={weightUnit} />
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
