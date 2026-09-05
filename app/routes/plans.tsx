import { Expose, Transform } from 'class-transformer';
import { IsString, MaxLength, MinLength } from 'class-validator';
import { PlusIcon, RepeatIcon } from 'lucide-react';
import { Link, data, redirect } from 'react-router';

import { requireAthlete } from '~/auth/user-context';
import { OwnershipBadge } from '~/components/forkable-header';
import { Page, PageHeader, Section } from '~/components/layout/page';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { Card, CardContent } from '~/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '~/components/ui/dialog';
import { EmptyState } from '~/components/ui/empty-state';
import { Field } from '~/components/ui/field';
import { Input } from '~/components/ui/input';
import { SubmitButton } from '~/components/ui/submit-button';
import { DateOnly } from '~/domain/values/date-only';
import { formatMonthDay, formatWeekday } from '~/lib/format';
import { requestLogger } from '~/lib/logger.server';
import { trim } from '~/lib/validate-form';
import { validateForm } from '~/lib/validate-form.server';

import { planServiceContext } from '~/lib/nest-bridge.server';

import type { Route } from './+types/plans';

export function meta() {
  return [{ title: 'Plans - Apex Gains' }];
}

export const handle = { crumb: () => ({ label: 'Plans' }) };

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

function PlanSummaryLine({ plan }: { plan: Route.ComponentProps['loaderData']['plans'][number] }) {
  if (plan.slotCount === 0) return <>No days yet</>;
  return (
    <>
      {plan.slotCount}-day cycle · anchored {formatWeekday(plan.anchorDate)} {formatMonthDay(plan.anchorDate)}
    </>
  );
}

export default function Plans({ loaderData, actionData }: Route.ComponentProps) {
  const error = actionData && 'error' in actionData ? actionData.error : undefined;
  const { plans: planList } = loaderData;

  const createForm = (
    <form method="post">
      <Field label="Name" error={error} action={<SubmitButton pendingLabel="Creating">Create</SubmitButton>}>
        <Input name="name" placeholder="Push/Pull/Legs" required />
      </Field>
    </form>
  );

  return (
    <Dialog defaultOpen={Boolean(error)}>
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
          actions={
            <DialogTrigger asChild>
              <Button variant="brand">
                <PlusIcon aria-hidden="true" />
                New plan
              </Button>
            </DialogTrigger>
          }
        />

        <Section title="Your plans">
          {planList.length === 0 ? (
            <EmptyState
              icon={RepeatIcon}
              title="No plans yet"
              description="Create one, then add day-slots and set it active."
              action={
                <DialogTrigger asChild>
                  <Button variant="outline">
                    <PlusIcon aria-hidden="true" />
                    New plan
                  </Button>
                </DialogTrigger>
              }
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
                        <OwnershipBadge isSample={plan.isSample} isCustomized={plan.isCustomized} />
                      </span>
                      <span className="text-sm text-muted-foreground tabular-nums">
                        <PlanSummaryLine plan={plan} />
                      </span>
                    </CardContent>
                  </Card>
                </li>
              ))}
              <li>
                <DialogTrigger asChild>
                  <button
                    type="button"
                    className="flex h-full min-h-24 w-full flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-border text-sm font-medium text-muted-foreground transition-colors duration-(--dur) hover:border-ring/40 hover:text-foreground"
                  >
                    <PlusIcon className="size-5" aria-hidden="true" />
                    New plan
                  </button>
                </DialogTrigger>
              </li>
            </ul>
          )}
        </Section>
      </Page>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>New plan</DialogTitle>
        </DialogHeader>
        {createForm}
      </DialogContent>
    </Dialog>
  );
}
