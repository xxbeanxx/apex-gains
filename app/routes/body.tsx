import { Expose, Transform } from 'class-transformer';
import { IsIn, IsNumber, IsPositive, IsUUID } from 'class-validator';
import { CheckCircle2Icon, RulerIcon, ScaleIcon, XIcon } from 'lucide-react';
import { useFetcher } from 'react-router';

import { requireAthlete } from '~/auth/user-context';
import { ExerciseProgressChart } from '~/components/history/exercise-progress-chart';
import { Page, PageHeader, Section } from '~/components/layout/page';
import { TabShell, type TabSection } from '~/components/layout/tab-shell';
import { Button } from '~/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';
import { EmptyState } from '~/components/ui/empty-state';
import { Field } from '~/components/ui/field';
import { Input } from '~/components/ui/input';
import { SubmitButton } from '~/components/ui/submit-button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '~/components/ui/table';
import { BODY_MEASUREMENT_METRICS, type BodyMeasurementMetric } from '~/domain/body/body-measurement';
import { DateOnly } from '~/domain/values/date-only';
import { formatFullDate } from '~/lib/format';
import { intent } from '~/lib/intent';
import { dispatch, handled } from '~/lib/intent.server';
import { IsDateOnly, toNumber } from '~/lib/validate-form';

import { bodyMeasurementsServiceContext, bodyWeightServiceContext, progressServiceContext } from '~/lib/nest-bridge.server';

import type { Route } from './+types/body';

const WEIGHT_SECTION = 'weight' as const;
const SECTION_IDS = [WEIGHT_SECTION, ...BODY_MEASUREMENT_METRICS] as const;
type SectionId = (typeof SECTION_IDS)[number];

/** Chart title, tab label, and empty-state copy for a section - the same regardless of the athlete's unit. */
const SECTION_LABELS: Record<SectionId, string> = {
  weight: 'Weight',
  waist: 'Waist',
  chest: 'Chest',
  arm_left: 'Left arm',
  arm_right: 'Right arm',
  thigh: 'Thigh',
  hips: 'Hips',
  neck: 'Neck',
};

function isMeasurement(section: SectionId): section is BodyMeasurementMetric {
  return section !== WEIGHT_SECTION;
}

function sectionFrom(request: Request): SectionId {
  const requested = new URL(request.url).searchParams.get('section');
  return (SECTION_IDS as readonly string[]).includes(requested ?? '') ? (requested as SectionId) : WEIGHT_SECTION;
}

export function meta() {
  return [{ title: 'Body - Apex Gains' }];
}

export const handle = { crumb: () => ({ label: 'Body' }) };

export async function loader({ request, context }: Route.LoaderArgs) {
  const athlete = requireAthlete(context);
  const section = sectionFrom(request);
  const progressService = context.get(progressServiceContext);
  const todayStr = DateOnly.today(new Date(), athlete.preferences.timezone).value;

  if (isMeasurement(section)) {
    const log = await progressService.bodyMeasurementLog(athlete, section);
    return { section, unit: log.unit, todayStr, entries: log.entries, series: log.series };
  }

  const log = await progressService.bodyWeightLog(athlete);
  return {
    section,
    unit: log.unit,
    todayStr,
    entries: log.entries.map((entry) => ({ id: entry.id, date: entry.date, value: entry.weight })),
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

class LogMeasurementDto {
  @Expose()
  @IsIn(BODY_MEASUREMENT_METRICS)
  readonly metric!: BodyMeasurementMetric;

  @Expose()
  @IsDateOnly()
  readonly date!: string;

  @Expose()
  @Transform(toNumber())
  @IsNumber()
  @IsPositive()
  readonly value!: number;
}

class RemoveMeasurementDto {
  @Expose()
  @IsIn(BODY_MEASUREMENT_METRICS)
  readonly metric!: BodyMeasurementMetric;

  @Expose()
  @IsDateOnly({ message: 'Unknown entry' })
  readonly date!: string;

  @Expose()
  @IsUUID(undefined, { message: 'Unknown entry' })
  readonly logId!: string;
}

const intents = {
  logWeight: intent('logWeight', LogWeightDto, { invalidMessage: 'Enter a valid date and weight.' }),
  removeWeight: intent('removeWeight', RemoveWeightDto),
  logMeasurement: intent('logMeasurement', LogMeasurementDto, { invalidMessage: 'Enter a valid date and measurement.' }),
  removeMeasurement: intent('removeMeasurement', RemoveMeasurementDto),
};

export async function action({ request, context }: Route.ActionArgs) {
  const athlete = requireAthlete(context);
  const today = DateOnly.today(new Date(), athlete.preferences.timezone);
  const bodyWeightService = context.get(bodyWeightServiceContext);
  const bodyMeasurementsService = context.get(bodyMeasurementsServiceContext);

  return dispatch(request, [
    handled(intents.logWeight, async ({ date, weight }) => {
      // Clamp instead of rejecting: a stale form (left open since yesterday)
      // should still log against today rather than fail outright. The
      // number is in whatever unit the athlete has chosen; the service
      // converts it to canonical storage.
      await bodyWeightService.record(athlete, DateOnly.parse(date).atMost(today), weight);
      return { ok: true, intent: intents.logWeight.name } as const;
    }),

    handled(intents.removeWeight, async ({ date, logId }) => {
      await bodyWeightService.remove(athlete, DateOnly.parse(date), logId);
      return { ok: true, intent: intents.removeWeight.name } as const;
    }),

    handled(intents.logMeasurement, async ({ date, metric, value }) => {
      await bodyMeasurementsService.record(athlete, DateOnly.parse(date).atMost(today), metric, value);
      return { ok: true, intent: intents.logMeasurement.name } as const;
    }),

    handled(intents.removeMeasurement, async ({ date, metric, logId }) => {
      await bodyMeasurementsService.remove(athlete, DateOnly.parse(date), metric, logId);
      return { ok: true, intent: intents.removeMeasurement.name } as const;
    }),
  ]);
}

/** Its own fetcher, so removing one entry hides only that row while its delete is in flight. */
function EntryRow({
  entry,
  unit,
  section,
}: {
  entry: Route.ComponentProps['loaderData']['entries'][number];
  unit: string;
  section: SectionId;
}) {
  const fetcher = useFetcher();
  const removeIntent = isMeasurement(section) ? intents.removeMeasurement : intents.removeWeight;

  return (
    <TableRow hidden={fetcher.state !== 'idle'}>
      <TableCell>{formatFullDate(entry.date)}</TableCell>
      <TableCell className="tabular-nums">
        {entry.value} {unit}
      </TableCell>
      <TableCell>
        <fetcher.Form method="post">
          <input {...removeIntent.field} />
          <input type="hidden" name="date" value={entry.date} />
          <input type="hidden" name="logId" value={entry.id} />
          {isMeasurement(section) ? <input type="hidden" name="metric" value={section} /> : null}
          <Button type="submit" variant="ghost" size="icon-sm" className="hover:bg-destructive/10 hover:text-destructive">
            <XIcon aria-hidden="true" />
            <span className="sr-only">Remove entry for {formatFullDate(entry.date)}</span>
          </Button>
        </fetcher.Form>
      </TableCell>
    </TableRow>
  );
}

function BodySection({ loaderData, actionData }: Pick<Route.ComponentProps, 'loaderData' | 'actionData'>) {
  const { section, unit, todayStr, entries, series } = loaderData;
  const label = SECTION_LABELS[section];
  const measurement = isMeasurement(section);
  const logIntent = measurement ? intents.logMeasurement : intents.logWeight;
  const valueField = measurement ? 'value' : 'weight';
  const error = logIntent.errorIn(actionData);

  return (
    <div className="flex flex-col gap-(--section-gap)">
      <Section title={`Log ${label.toLowerCase()}`}>
        <Card>
          <CardContent>
            <form method="post" className="flex flex-wrap items-end gap-4">
              <input {...logIntent.field} />
              {measurement ? <input type="hidden" name="metric" value={section} /> : null}
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
              <Field label={`${label} (${unit})`} error={error} className="w-40">
                <Input name={valueField} type="number" step="0.1" min="0" required />
              </Field>
              <SubmitButton match={logIntent.match} pendingLabel="Saving">
                Save
              </SubmitButton>
            </form>

            <div aria-live="polite" className="empty:hidden">
              {logIntent.succeededIn(actionData) ? (
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
              <CardTitle>{label}</CardTitle>
            </CardHeader>
            <CardContent>
              <ExerciseProgressChart series={series} />
            </CardContent>
          </Card>
        </Section>
      ) : null}

      <Section title="History">
        {entries.length === 0 ? (
          <EmptyState
            icon={measurement ? RulerIcon : ScaleIcon}
            title={`No ${label.toLowerCase()} entries yet`}
            description={`Log a ${label.toLowerCase()} measurement above and it will show up here.`}
          />
        ) : (
          <Card>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>{label}</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entries.map((entry) => (
                    <EntryRow key={entry.id} entry={entry} unit={unit} section={section} />
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </Section>
    </div>
  );
}

export default function Body({ loaderData, actionData }: Route.ComponentProps) {
  const sections: TabSection[] = SECTION_IDS.map((id) => ({
    id,
    label: SECTION_LABELS[id],
    content: id === loaderData.section ? <BodySection loaderData={loaderData} actionData={actionData} /> : null,
  }));

  return (
    <Page>
      <PageHeader title="Body" description="Log body weight and measurements, and watch the trend over time." />

      <div className="mt-(--section-gap)">
        <TabShell
          sections={sections}
          activeId={loaderData.section}
          hrefFor={(id) => `/body?section=${id}`}
          ariaLabel="Body sections"
        />
      </div>
    </Page>
  );
}
