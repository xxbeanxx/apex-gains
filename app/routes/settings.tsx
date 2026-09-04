import { Expose } from 'class-transformer';
import { IsIn } from 'class-validator';
import { CheckCircle2Icon } from 'lucide-react';
import { data } from 'react-router';

import { userContext } from '~/auth/user-context';
import { Page, PageHeader } from '~/components/layout/page';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card';
import { Checkbox } from '~/components/ui/checkbox';
import { Field } from '~/components/ui/field';
import { SubmitButton } from '~/components/ui/submit-button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/components/ui/select';
import { DISTANCE_UNITS, type DistanceUnit, WEIGHT_UNITS, type WeightUnit } from '~/domain/values/units';
import { validateForm } from '~/lib/validate-form.server';

import { athleteServiceContext } from '~/lib/nest-bridge.server';

import type { Route } from './+types/settings';

export function meta() {
  return [{ title: 'Settings - Apex Gains' }];
}

class UpdateUnitsDto {
  @Expose()
  @IsIn(WEIGHT_UNITS)
  readonly weightUnit!: WeightUnit;

  @Expose()
  @IsIn(DISTANCE_UNITS)
  readonly distanceUnit!: DistanceUnit;
}

class UpdateSampleDataVisibilityDto {
  @Expose()
  @IsIn(['true', 'false'])
  readonly showSampleData!: 'true' | 'false';
}

export async function loader({ context }: Route.LoaderArgs) {
  const { preferences } = context.get(userContext)!;
  return {
    weightUnit: preferences.weightUnit,
    distanceUnit: preferences.distanceUnit,
    showSampleData: preferences.showSampleData,
  };
}

export async function action({ request, context }: Route.ActionArgs) {
  const user = context.get(userContext)!;
  const formData = await request.formData();
  const intent = formData.get('intent');

  const athleteService = context.get(athleteServiceContext);

  if (intent === 'updateSampleDataVisibility') {
    const result = validateForm(UpdateSampleDataVisibilityDto, {
      // An unchecked checkbox is absent from the submission entirely - that
      // absence is how a browser spells "false", and the only way this form
      // ever turns sample data off.
      showSampleData: formData.get('showSampleData') ?? 'false',
    });
    if (!result.success) {
      return data({ error: result.message }, { status: 400 });
    }
    await athleteService.changeSampleDataVisibility(user, result.data.showSampleData === 'true');
    return { ok: true, intent: 'updateSampleDataVisibility' } as const;
  }

  const result = validateForm(UpdateUnitsDto, {
    weightUnit: formData.get('weightUnit'),
    distanceUnit: formData.get('distanceUnit'),
  });

  if (!result.success) {
    return data({ error: 'Invalid unit selection.' }, { status: 400 });
  }

  await athleteService.changeUnits(user, result.data.weightUnit, result.data.distanceUnit);

  return { ok: true, intent: 'updateUnits' } as const;
}

export default function Settings({ loaderData, actionData }: Route.ComponentProps) {
  const error = actionData && 'error' in actionData ? actionData.error : undefined;

  return (
    <Page width="prose">
      <PageHeader title="Settings" description="Preferences that apply across every workout you log." />

      <Card className="mt-(--section-gap)">
        <CardHeader>
          <CardTitle>Units</CardTitle>
          <CardDescription>
            Choose the unit for each measurement type. Weight and distance/speed can be set independently.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form method="post" className="flex flex-col gap-6">
            <input type="hidden" name="intent" value="updateUnits" />
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

            {
              // Both outcomes land in one live region so a screen reader hears
              // the result of saving without moving focus.
            }
            <div aria-live="polite" className="empty:hidden">
              {actionData && 'ok' in actionData && actionData.intent === 'updateUnits' ? (
                <p className="animate-fade-in flex items-center gap-1.5 text-sm font-medium text-success">
                  <CheckCircle2Icon className="size-4" aria-hidden="true" />
                  Saved.
                </p>
              ) : null}
            </div>

            <SubmitButton match={{ intent: 'updateUnits' }} pendingLabel="Saving" className="self-start">
              Save
            </SubmitButton>
          </form>
        </CardContent>
      </Card>

      <Card className="mt-(--section-gap)">
        <CardHeader>
          <CardTitle>Sample data</CardTitle>
          <CardDescription>
            Apex Gains ships with sample exercises, templates, and a routine so there's something to explore right away. Hide
            them once you've built out your own — anything you've customized from a sample stays visible either way.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form method="post" className="flex flex-col gap-4">
            <input type="hidden" name="intent" value="updateSampleDataVisibility" />
            <label className="flex cursor-pointer items-center gap-2.5 text-sm">
              <Checkbox name="showSampleData" value="true" defaultChecked={loaderData.showSampleData} />
              Show sample data
            </label>

            <div aria-live="polite" className="empty:hidden">
              {actionData && 'ok' in actionData && actionData.intent === 'updateSampleDataVisibility' ? (
                <p className="animate-fade-in flex items-center gap-1.5 text-sm font-medium text-success">
                  <CheckCircle2Icon className="size-4" aria-hidden="true" />
                  Saved.
                </p>
              ) : null}
            </div>

            <SubmitButton match={{ intent: 'updateSampleDataVisibility' }} pendingLabel="Saving" className="self-start">
              Save
            </SubmitButton>
          </form>
        </CardContent>
      </Card>
    </Page>
  );
}
