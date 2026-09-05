import { DownloadIcon, MoonIcon } from 'lucide-react';
import { Expose } from 'class-transformer';
import { data, redirect } from 'react-router';

import { requireAthlete } from '~/auth/user-context';
import { Page, PageHeader, Section } from '~/components/layout/page';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';
import { Field } from '~/components/ui/field';
import { Input } from '~/components/ui/input';
import { SubmitButton } from '~/components/ui/submit-button';
import { DateOnly } from '~/domain/values/date-only';
import { requestLogger } from '~/lib/logger.server';
import { validateForm } from '~/lib/validate-form.server';
import { IsDateOnly } from '~/lib/validate-form';

import { routineImportServiceContext } from '~/lib/nest-bridge.server';

import type { Route } from './+types/routines.import.$shareToken';

/**
 * Taking a routine somebody shared, by link or by QR code.
 *
 * Sits under the `_protected` layout on purpose. A recipient scanning a code
 * on someone's phone is usually not signed in, and `requireUserMiddleware`
 * answers that by redirecting to `/auth/google?redirectTo=<this URL>`; the
 * OIDC state cookie carries that destination across the round-trip to
 * Google, so they land back here - on the right token - once they have an
 * account. Open signup means the account can be brand new.
 *
 * The page confirms before writing anything, because an import adds to the
 * athlete's library as well as their routines and the counts are worth
 * seeing first.
 */
export function meta({ loaderData }: Route.MetaArgs) {
  return [{ title: `${loaderData?.shared.name ?? 'Shared routine'} - Apex Gains` }];
}

function notFound(): never {
  throw data('This share link is no longer valid', { status: 404 });
}

export async function loader({ params, context }: Route.LoaderArgs) {
  const athlete = requireAthlete(context);
  const shared = await context.get(routineImportServiceContext).preview(athlete, params.shareToken);
  if (!shared) notFound();

  // Their own link, come back to them. Copying it would work, but what they
  // almost certainly want is the routine they already have.
  if (shared.ownRoutineId) throw redirect(`/routines/${shared.ownRoutineId}`);

  return { shared };
}

class ImportRoutineDto {
  @Expose()
  @IsDateOnly()
  readonly anchorDate!: string;
}

export async function action({ request, params, context }: Route.ActionArgs) {
  const athlete = requireAthlete(context);

  const form = validateForm(ImportRoutineDto, Object.fromEntries(await request.formData()));
  if (!form.success) return data({ error: 'Invalid date' }, { status: 400 });

  const outcome = await context
    .get(routineImportServiceContext)
    .import(athlete, params.shareToken, DateOnly.parse(form.data.anchorDate));
  if (!outcome.ok) notFound();

  requestLogger(context).log(`imported shared routine as ${outcome.value.routineId} for user ${athlete.id}`, 'Routines');
  throw redirect(`/routines/${outcome.value.routineId}`);
}

/** "3 templates and 2 exercises", or null when the import adds neither. */
function additionsSummary(newTemplates: number, newExercises: number): string | null {
  const parts: string[] = [];
  if (newTemplates > 0) parts.push(`${newTemplates} ${newTemplates === 1 ? 'template' : 'templates'}`);
  if (newExercises > 0) parts.push(`${newExercises} ${newExercises === 1 ? 'exercise' : 'exercises'}`);
  return parts.length === 0 ? null : parts.join(' and ');
}

export default function ImportSharedRoutine({ loaderData, actionData }: Route.ComponentProps) {
  const { shared } = loaderData;
  const additions = additionsSummary(shared.newTemplates, shared.newExercises);

  return (
    <Page width="narrow">
      <PageHeader
        title={shared.name}
        description={
          shared.sharedBy
            ? `${shared.sharedBy} shared this ${shared.slots.length}-day routine with you.`
            : `A shared ${shared.slots.length}-day routine.`
        }
      />

      <Section title="Days" description="The cycle as it was shared. Your copy starts from the date you pick below.">
        {shared.slots.length === 0 ? (
          <p className="text-sm text-muted-foreground">This routine has no days yet.</p>
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
                      slot.templateName
                    )}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        )}

        <Card className="max-w-xl">
          <CardHeader>
            <CardTitle>Add to your routines</CardTitle>
            <p className="text-sm text-muted-foreground">
              {additions
                ? `This also adds ${additions} to your library. Anything you already have is reused rather than duplicated.`
                : 'You already have everything this routine needs, so only the routine itself is added.'}
            </p>
          </CardHeader>
          <CardContent>
            <form method="post">
              <Field
                label="Anchor date"
                description="Day 1 of the cycle falls on this date. It starts where the original does; move it to start today."
                error={actionData?.error}
                action={
                  <SubmitButton pendingLabel="Importing routine">
                    <DownloadIcon aria-hidden="true" />
                    Import
                  </SubmitButton>
                }
              >
                <Input name="anchorDate" type="date" defaultValue={shared.anchorDate} required />
              </Field>
            </form>
          </CardContent>
        </Card>
      </Section>
    </Page>
  );
}
