import { Form, data, redirect } from 'react-router';

import { Expose } from 'class-transformer';
import { DownloadIcon, MoonIcon } from 'lucide-react';

import { requireAthlete } from '~/auth/user-context';
import { Page, PageHeader, Section } from '~/components/layout/page';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';
import { Field } from '~/components/ui/field';
import { Input } from '~/components/ui/input';
import { SubmitButton } from '~/components/ui/submit-button';
import { requestLogger } from '~/lib/logger';
import { IsDateOnly } from '~/lib/validate-form';
import { validateForm } from '~/lib/validate-form.server';
import { planImportServiceContext } from '~/router/load-context';
import { DateOnly } from '~domain/values/date-only';

import type { Route } from './+types/plans.import.$shareToken';

/**
 * Taking a plan somebody shared, by link or by QR code.
 *
 * Sits under the `_protected` layout on purpose. A recipient scanning a code
 * on someone's phone is usually not signed in, and `requireUserMiddleware`
 * answers that by redirecting to `/auth/google?redirectTo=<this URL>`; the
 * OIDC state cookie carries that destination across the round-trip to
 * Google, so they land back here - on the right token - once they have an
 * account. Open signup means the account can be brand new.
 *
 * The page confirms before writing anything, because an import adds to the
 * athlete's library as well as their plans and the counts are worth
 * seeing first.
 */
export function meta({ loaderData }: Route.MetaArgs) {
  return [{ title: `${loaderData?.shared.name ?? 'Shared plan'} - Apex Gains` }];
}

export const handle = {
  crumb: (data: Awaited<ReturnType<typeof loader>>) => [
    { label: 'Plans', to: '/plans' },
    { label: `Import ${data.shared.name}` },
  ],
};

function notFound(): never {
  throw data('This share link is no longer valid', { status: 404 });
}

export async function loader({ params, context }: Route.LoaderArgs) {
  const athlete = requireAthlete(context);
  const shared = await context.get(planImportServiceContext).preview(athlete, params.shareToken);
  if (!shared) notFound();

  // Their own link, come back to them. Copying it would work, but what they
  // almost certainly want is the plan they already have.
  if (shared.ownPlanId) throw redirect(`/plans/${shared.ownPlanId}`);

  return { shared };
}

class ImportPlanDto {
  @Expose()
  @IsDateOnly()
  readonly anchorDate!: string;
}

export async function action({ request, params, context }: Route.ActionArgs) {
  const athlete = requireAthlete(context);

  const form = validateForm(ImportPlanDto, Object.fromEntries(await request.formData()));
  if (!form.success) return data({ error: 'Invalid date' }, { status: 400 });

  const outcome = await context
    .get(planImportServiceContext)
    .import(athlete, params.shareToken, DateOnly.parse(form.data.anchorDate));
  if (!outcome.ok) notFound();

  requestLogger(context).log(`imported shared plan as ${outcome.value.planId} for user ${athlete.id}`, 'Plans');
  throw redirect(`/plans/${outcome.value.planId}`);
}

/** "3 workouts and 2 exercises", or null when the import adds neither. */
function additionsSummary(newWorkouts: number, newExercises: number): string | null {
  const parts: string[] = [];
  if (newWorkouts > 0) parts.push(`${newWorkouts} ${newWorkouts === 1 ? 'workout' : 'workouts'}`);
  if (newExercises > 0) parts.push(`${newExercises} ${newExercises === 1 ? 'exercise' : 'exercises'}`);
  return parts.length === 0 ? null : parts.join(' and ');
}

export default function ImportSharedPlan({ loaderData, actionData }: Route.ComponentProps) {
  const { shared } = loaderData;
  const additions = additionsSummary(shared.newWorkouts, shared.newExercises);

  return (
    <Page width="narrow">
      <PageHeader
        title={shared.name}
        description={
          shared.sharedBy
            ? `${shared.sharedBy} shared this ${shared.slots.length}-day plan with you.`
            : `A shared ${shared.slots.length}-day plan.`
        }
      />

      <Section title="Days" description="The cycle as it was shared. Your copy starts from the date you pick below.">
        {shared.slots.length === 0 ? (
          <p className="text-sm text-muted-foreground">This plan has no days yet.</p>
        ) : (
          <ol className="grid gap-3 lg:grid-cols-2">
            {shared.slots.map((slot, index) => (
              <li
                key={slot.position}
                className="flex items-center gap-3 rounded-xl border border-border bg-card px-3 py-2.5 shadow-sm shadow-black/[0.03] dark:shadow-black/20"
              >
                <span
                  aria-hidden="true"
                  className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-xs font-semibold text-muted-foreground tabular-nums"
                >
                  {index + 1}
                </span>
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">Day {index + 1}</p>
                  <p className="flex items-center gap-1.5 truncate font-medium">
                    {slot.isRestDay ? (
                      <>
                        <MoonIcon className="size-3.5 text-muted-foreground" aria-hidden="true" />
                        Rest
                      </>
                    ) : (
                      slot.workoutName
                    )}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        )}

        <Card className="max-w-xl">
          <CardHeader>
            <CardTitle>Add to your plans</CardTitle>
            <p className="text-sm text-muted-foreground">
              {additions
                ? `This also adds ${additions} to your library. Anything you already have is reused rather than duplicated.`
                : 'You already have everything this plan needs, so only the plan itself is added.'}
            </p>
          </CardHeader>
          <CardContent>
            <Form method="post">
              <Field
                label="Anchor date"
                description="Day 1 of the cycle falls on this date. It starts where the original does; move it to start today."
                error={actionData?.error}
                action={
                  <SubmitButton pendingLabel="Importing plan">
                    <DownloadIcon aria-hidden="true" />
                    Import
                  </SubmitButton>
                }
              >
                <Input name="anchorDate" type="date" defaultValue={shared.anchorDate} required />
              </Field>
            </Form>
          </CardContent>
        </Card>
      </Section>
    </Page>
  );
}
