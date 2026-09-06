import { Expose, Transform } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsPositive, IsString } from 'class-validator';
import { CheckCircle2Icon, DownloadIcon, Trash2Icon } from 'lucide-react';
import { useId } from 'react';
import { data, Form, redirect } from 'react-router';

import { requireAthlete } from '~/auth/user-context';
import { Page, PageHeader } from '~/components/layout/page';
import { TabShell, type TabSection } from '~/components/layout/tab-shell';
import { Button } from '~/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card';
import { Checkbox } from '~/components/ui/checkbox';
import { ConfirmDialog } from '~/components/ui/confirm-dialog';
import { Field } from '~/components/ui/field';
import { Input } from '~/components/ui/input';
import { SubmitButton } from '~/components/ui/submit-button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/components/ui/select';
import { TimezonePicker } from '~/components/settings/timezone-picker';
import {
  DISTANCE_UNITS,
  type DistanceUnit,
  LENGTH_UNITS,
  type LengthUnit,
  WEIGHT_UNITS,
  type WeightUnit,
} from '~domain/values/units';
import { TIMEZONES } from '~domain/values/timezone';
import { requestLogger } from '~/lib/logger';
import { intent } from '~/lib/intent';
import { dispatch, handled } from '~/lib/intent.server';
import { toOptionalNumber } from '~/lib/validate-form';

import { athleteServiceContext, sessionStorageContext } from '~/router/load-context';

import type { Route } from './+types/settings';

export function meta() {
  return [{ title: 'Settings - Apex Gains' }];
}

export const handle = { crumb: () => ({ label: 'Settings' }) };

class UpdateUnitsDto {
  @Expose()
  @IsIn(WEIGHT_UNITS)
  readonly weightUnit!: WeightUnit;

  @Expose()
  @IsIn(DISTANCE_UNITS)
  readonly distanceUnit!: DistanceUnit;

  @Expose()
  @IsIn(LENGTH_UNITS)
  readonly lengthUnit!: LengthUnit;
}

class UpdateSampleDataVisibilityDto {
  @Expose()
  @IsIn(['true', 'false'])
  readonly showSampleData!: 'true' | 'false';
}

class UpdateTimezoneDto {
  @Expose()
  @IsIn(TIMEZONES)
  readonly timezone!: string;
}

class UpdateRestDurationDto {
  // A blank field turns the timer off - absent, not zero.
  @Expose()
  @Transform(toOptionalNumber())
  @IsOptional()
  @IsInt()
  @IsPositive()
  readonly restSeconds?: number;
}

class DeleteAccountDto {
  @Expose()
  @IsString()
  readonly confirmEmail!: string;
}

const SECTION_IDS = ['units', 'timezone', 'rest-timer', 'sample-data', 'account'] as const;
type SectionId = (typeof SECTION_IDS)[number];

function sectionFrom(request: Request): SectionId {
  const requested = new URL(request.url).searchParams.get('section');
  return (SECTION_IDS as readonly string[]).includes(requested ?? '') ? (requested as SectionId) : 'units';
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const athlete = requireAthlete(context);
  const { preferences } = athlete;
  return {
    section: sectionFrom(request),
    email: athlete.email,
    weightUnit: preferences.weightUnit,
    distanceUnit: preferences.distanceUnit,
    lengthUnit: preferences.lengthUnit,
    showSampleData: preferences.showSampleData,
    timezone: preferences.timezone,
    restSeconds: preferences.restDuration?.inSeconds ?? null,
  };
}

const intents = {
  updateUnits: intent('updateUnits', UpdateUnitsDto, { invalidMessage: 'Invalid unit selection.' }),
  updateSampleDataVisibility: intent('updateSampleDataVisibility', UpdateSampleDataVisibilityDto, {
    // An unchecked checkbox is absent from the submission entirely - that
    // absence is how a browser spells "false", and the only way this form
    // ever turns sample data off.
    fields: (formData) => ({ showSampleData: formData.get('showSampleData') ?? 'false' }),
  }),
  updateTimezone: intent('updateTimezone', UpdateTimezoneDto, { invalidMessage: 'Unknown timezone.' }),
  updateRestDuration: intent('updateRestDuration', UpdateRestDurationDto, { invalidMessage: 'Invalid rest duration.' }),
  deleteAccount: intent('deleteAccount', DeleteAccountDto, {
    // Same as admin.users.$userId.tsx: the message is the same whether the
    // field was blank or simply wrong - the confirmation is about
    // deliberateness, not about spelling.
    invalidMessage: "That doesn't match your account's email address.",
  }),
};

export async function action({ request, context }: Route.ActionArgs) {
  const athlete = requireAthlete(context);
  const athleteService = context.get(athleteServiceContext);

  return dispatch(request, [
    handled(intents.updateUnits, async ({ weightUnit, distanceUnit, lengthUnit }) => {
      await athleteService.changeUnits(athlete, weightUnit, distanceUnit, lengthUnit);
      return { ok: true, intent: intents.updateUnits.name } as const;
    }),

    handled(intents.updateSampleDataVisibility, async ({ showSampleData }) => {
      await athleteService.changeSampleDataVisibility(athlete, showSampleData === 'true');
      return { ok: true, intent: intents.updateSampleDataVisibility.name } as const;
    }),

    handled(intents.updateTimezone, async ({ timezone }) => {
      await athleteService.changeTimezone(athlete, timezone);
      return { ok: true, intent: intents.updateTimezone.name } as const;
    }),

    handled(intents.updateRestDuration, async ({ restSeconds }) => {
      await athleteService.changeRestDuration(athlete, restSeconds ?? null);
      return { ok: true, intent: intents.updateRestDuration.name } as const;
    }),

    handled(intents.deleteAccount, async ({ confirmEmail }) => {
      // The typed email is the confirmation step: this deletes the whole of
      // an athlete's own training history along with the account, and there
      // is no undo.
      if (confirmEmail.trim().toLowerCase() !== athlete.email.toLowerCase()) {
        return intents.deleteAccount.reject("That doesn't match your account's email address.");
      }

      const outcome = await athleteService.closeOwnAccount(athlete);
      if (!outcome.ok) {
        return intents.deleteAccount.reject(
          "You're the only administrator, so you can't close this account. Grant admin access to someone else first.",
        );
      }

      requestLogger(context).log(`closed own account for user ${athlete.id}`, 'Settings');

      const sessionStorage = context.get(sessionStorageContext);
      const session = await sessionStorage.getSession(request.headers.get('Cookie'));
      throw redirect('/', {
        headers: { 'Set-Cookie': await sessionStorage.destroySession(session) },
      });
    }),
  ]);
}

export default function Settings({ loaderData, actionData }: Route.ComponentProps) {
  const error = intents.updateUnits.errorIn(actionData) ?? intents.updateSampleDataVisibility.errorIn(actionData);
  const deleteAccountFormId = useId();

  // No `action` attribute on any of these forms: each submits to whatever
  // URL is current, `?section=...` included, so a save lands back on the
  // section that made it rather than resetting to the first one.
  const sections: TabSection[] = [
    {
      id: 'units',
      label: 'Units',
      content: (
        <Card>
          <CardHeader>
            <CardTitle>Units</CardTitle>
            <CardDescription>
              Choose the unit for each measurement type. Weight, distance/speed, and body measurements can be set independently.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form method="post" className="flex flex-col gap-6">
              <input {...intents.updateUnits.field} />
              <Field label="Weight" error={error}>
                {({ id, describedBy }) => (
                  <Select name="weightUnit" defaultValue={loaderData.weightUnit}>
                    <SelectTrigger id={id} aria-describedby={describedBy} className="w-full">
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
                  <Select name="distanceUnit" defaultValue={loaderData.distanceUnit}>
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

              <Field label="Body measurements">
                {({ id }) => (
                  <Select name="lengthUnit" defaultValue={loaderData.lengthUnit}>
                    <SelectTrigger id={id} className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cm">Centimeters (cm)</SelectItem>
                      <SelectItem value="in">Inches (in)</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              </Field>

              {
                // Both outcomes land in one live region so a screen reader hears
                // the result of saving without moving focus.
              }
              <div aria-live="polite" className="empty:hidden">
                {intents.updateUnits.succeededIn(actionData) ? (
                  <p className="animate-fade-in flex items-center gap-1.5 text-sm font-medium text-success">
                    <CheckCircle2Icon className="size-4" aria-hidden="true" />
                    Saved.
                  </p>
                ) : null}
              </div>

              <SubmitButton match={intents.updateUnits.match} pendingLabel="Saving" className="self-start">
                Save
              </SubmitButton>
            </Form>
          </CardContent>
        </Card>
      ),
    },
    {
      id: 'timezone',
      label: 'Timezone',
      content: (
        <Card>
          <CardHeader>
            <CardTitle>Timezone</CardTitle>
            <CardDescription>
              Decides when your training day starts and ends, and which day a workout or weigh-in is logged against.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form method="post" className="flex flex-col gap-6">
              <input {...intents.updateTimezone.field} />
              <Field label="Timezone" error={intents.updateTimezone.errorIn(actionData)}>
                {({ id, describedBy }) => (
                  <TimezonePicker
                    id={id}
                    name="timezone"
                    zones={TIMEZONES}
                    defaultValue={loaderData.timezone}
                    describedBy={describedBy}
                  />
                )}
              </Field>

              <div aria-live="polite" className="empty:hidden">
                {intents.updateTimezone.succeededIn(actionData) ? (
                  <p className="animate-fade-in flex items-center gap-1.5 text-sm font-medium text-success">
                    <CheckCircle2Icon className="size-4" aria-hidden="true" />
                    Saved.
                  </p>
                ) : null}
              </div>

              <SubmitButton match={intents.updateTimezone.match} pendingLabel="Saving" className="self-start">
                Save
              </SubmitButton>
            </Form>
          </CardContent>
        </Card>
      ),
    },
    {
      id: 'rest-timer',
      label: 'Rest timer',
      content: (
        <Card>
          <CardHeader>
            <CardTitle>Rest timer</CardTitle>
            <CardDescription>
              How long to rest between sets by default, shown on the logging form after each one. A workout's own exercises can
              override this. Leave it blank to turn the timer off.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form method="post" className="flex flex-col gap-6">
              <input {...intents.updateRestDuration.field} />
              <Field label="Seconds" error={intents.updateRestDuration.errorIn(actionData)} className="sm:max-w-40">
                {({ id, describedBy }) => (
                  <Input
                    id={id}
                    aria-describedby={describedBy}
                    name="restSeconds"
                    type="number"
                    min={1}
                    inputMode="numeric"
                    placeholder="off"
                    defaultValue={loaderData.restSeconds ?? undefined}
                  />
                )}
              </Field>

              <div aria-live="polite" className="empty:hidden">
                {intents.updateRestDuration.succeededIn(actionData) ? (
                  <p className="animate-fade-in flex items-center gap-1.5 text-sm font-medium text-success">
                    <CheckCircle2Icon className="size-4" aria-hidden="true" />
                    Saved.
                  </p>
                ) : null}
              </div>

              <SubmitButton match={intents.updateRestDuration.match} pendingLabel="Saving" className="self-start">
                Save
              </SubmitButton>
            </Form>
          </CardContent>
        </Card>
      ),
    },
    {
      id: 'sample-data',
      label: 'Sample data',
      content: (
        <Card>
          <CardHeader>
            <CardTitle>Sample data</CardTitle>
            <CardDescription>
              Apex Gains ships with sample exercises, workouts, and a plan so there's something to explore right away. Hide them
              once you've built out your own — anything you've customized from a sample stays visible either way.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form method="post" className="flex flex-col gap-4">
              <input {...intents.updateSampleDataVisibility.field} />
              <label className="flex cursor-pointer items-center gap-2.5 text-sm">
                <Checkbox name="showSampleData" value="true" defaultChecked={loaderData.showSampleData} />
                Show sample data
              </label>

              <div aria-live="polite" className="empty:hidden">
                {intents.updateSampleDataVisibility.succeededIn(actionData) ? (
                  <p className="animate-fade-in flex items-center gap-1.5 text-sm font-medium text-success">
                    <CheckCircle2Icon className="size-4" aria-hidden="true" />
                    Saved.
                  </p>
                ) : null}
              </div>

              <SubmitButton match={intents.updateSampleDataVisibility.match} pendingLabel="Saving" className="self-start">
                Save
              </SubmitButton>
            </Form>
          </CardContent>
        </Card>
      ),
    },
    {
      id: 'account',
      label: 'Account',
      content: (
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Export your data</CardTitle>
              <CardDescription>
                Download every exercise, workout, plan, session and weigh-in you've logged. Measurements come out in canonical
                units (pounds, km/h, seconds) rather than your display unit, so an export stays comparable even after you change
                a setting.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              <Button asChild variant="outline" size="sm">
                <a href="/settings/export?format=json">
                  <DownloadIcon aria-hidden="true" />
                  Download JSON
                </a>
              </Button>
              <Button asChild variant="outline" size="sm">
                <a href="/settings/export?format=csv">
                  <DownloadIcon aria-hidden="true" />
                  Download CSV
                </a>
              </Button>
            </CardContent>
          </Card>

          <Card className="border-destructive/30">
            <CardHeader>
              <CardTitle>Close your account</CardTitle>
              <CardDescription>
                Permanently removes your account along with every exercise, workout, plan, session and weigh-in you own. This
                can't be undone.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Form method="post" id={deleteAccountFormId} className="flex flex-col gap-3">
                <input {...intents.deleteAccount.field} />
                <Field
                  label="Type your email to confirm"
                  description={loaderData.email}
                  error={intents.deleteAccount.errorIn(actionData)}
                  className="sm:max-w-sm"
                >
                  <Input name="confirmEmail" type="email" autoComplete="off" required />
                </Field>
              </Form>

              <ConfirmDialog
                trigger={
                  <Button variant="destructive" size="sm" className="mt-3">
                    <Trash2Icon aria-hidden="true" />
                    Close account
                  </Button>
                }
                title="Close your account?"
                description="This permanently deletes your account and everything in it. This can't be undone."
                confirmButton={
                  <SubmitButton
                    form={deleteAccountFormId}
                    variant="destructive"
                    size="sm"
                    match={intents.deleteAccount.match}
                    pendingLabel="Closing account"
                  >
                    <Trash2Icon aria-hidden="true" />
                    Close account
                  </SubmitButton>
                }
              />
            </CardContent>
          </Card>
        </div>
      ),
    },
  ];

  return (
    <Page width="prose">
      <PageHeader title="Settings" description="Preferences that apply across every workout you log." />

      <div className="mt-(--section-gap)">
        <TabShell
          sections={sections}
          activeId={loaderData.section}
          hrefFor={(id) => `/settings?section=${id}`}
          ariaLabel="Settings sections"
        />
      </div>
    </Page>
  );
}
