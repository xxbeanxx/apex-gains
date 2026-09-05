import { Expose, Transform } from 'class-transformer';
import { IsString, MaxLength, MinLength } from 'class-validator';
import { RepeatIcon } from 'lucide-react';
import { Link, data, redirect } from 'react-router';

import { requireAthlete } from '~/auth/user-context';
import { Page, PageHeader, Section } from '~/components/layout/page';
import { Badge } from '~/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';
import { EmptyState } from '~/components/ui/empty-state';
import { Field } from '~/components/ui/field';
import { Input } from '~/components/ui/input';
import { SubmitButton } from '~/components/ui/submit-button';
import { DateOnly } from '~/domain/values/date-only';
import { requestLogger } from '~/lib/logger.server';
import { trim } from '~/lib/validate-form';
import { validateForm } from '~/lib/validate-form.server';

import { planServiceContext } from '~/lib/nest-bridge.server';

import type { Route } from './+types/plans';

export function meta() {
  return [{ title: 'Plans - Apex Gains' }];
}

class CreatePlanDto {
  @Expose()
  @Transform(trim())
  @IsString()
  @MinLength(1, { message: 'Name is required' })
  @MaxLength(100)
  readonly name!: string;
}

export async function loader({ context }: Route.LoaderArgs) {
  const athlete = requireAthlete(context);
  const planService = context.get(planServiceContext);
  return { plans: await planService.list(athlete) };
}

export async function action({ request, context }: Route.ActionArgs) {
  const user = requireAthlete(context);
  const formData = await request.formData();
  const result = validateForm(CreatePlanDto, { name: formData.get('name') });

  if (!result.success) {
    return data({ error: result.message }, { status: 400 });
  }

  // A new plan is anchored to today, so its first slot is today's - the
  // athlete can re-anchor it afterwards.
  const planService = context.get(planServiceContext);
  const plan = await planService.create(user, result.data.name, DateOnly.today(new Date(), user.preferences.timezone));

  requestLogger(context).log(`created plan ${plan.id} for user ${user.id}`, 'Plans');

  throw redirect(`/plans/${plan.id}`);
}

export default function Plans({ loaderData, actionData }: Route.ComponentProps) {
  const error = actionData && 'error' in actionData ? actionData.error : undefined;
  const { plans: planList } = loaderData;

  return (
    <Page>
      <PageHeader
        title="Plans"
        description={
          <>
            A plan is a repeating cycle of days — each day is either one of your{' '}
            <Link
              to="/workouts"
              className="font-medium text-foreground underline decoration-brand-strong decoration-2 underline-offset-4 hover:decoration-4"
            >
              workouts
            </Link>{' '}
            or a rest day. Only one plan can be active at a time; the active plan drives what shows up on the Today page.
          </>
        }
      />

      <Card className="mt-(--section-gap) max-w-md">
        <CardHeader>
          <CardTitle>New plan</CardTitle>
        </CardHeader>
        <CardContent>
          <form method="post">
            <Field label="Name" error={error} action={<SubmitButton pendingLabel="Creating">Create</SubmitButton>}>
              <Input name="name" placeholder="Push/Pull/Legs" required />
            </Field>
          </form>
        </CardContent>
      </Card>

      <Section title="Your plans">
        {planList.length === 0 ? (
          <EmptyState
            icon={RepeatIcon}
            title="No plans yet"
            description="Create one above, then add day-slots and set it active."
          />
        ) : (
          <ul className="stagger grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {planList.map((plan) => (
              <li key={plan.id}>
                <Card interactive size="sm" className="relative h-full">
                  <CardContent className="flex h-full flex-col justify-between gap-2">
                    <span className="flex flex-wrap items-center gap-2">
                      <Link
                        to={`/plans/${plan.id}`}
                        className="font-heading font-medium after:absolute after:inset-0 after:content-['']"
                      >
                        {plan.name}
                      </Link>
                      {plan.isActive ? <Badge variant="brand">Active</Badge> : null}
                      {plan.isSample ? (
                        <Badge variant="outline">Sample</Badge>
                      ) : plan.isCustomized ? (
                        <Badge variant="secondary">Customized</Badge>
                      ) : null}
                    </span>
                    <span className="text-sm text-muted-foreground tabular-nums">
                      {plan.slotCount} day
                      {plan.slotCount === 1 ? '' : 's'}
                    </span>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </Page>
  );
}
