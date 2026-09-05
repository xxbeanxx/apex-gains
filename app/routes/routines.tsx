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

import { routineServiceContext } from '~/lib/nest-bridge.server';

import type { Route } from './+types/routines';

export function meta() {
  return [{ title: 'Routines - Apex Gains' }];
}

class CreateRoutineDto {
  @Expose()
  @Transform(trim())
  @IsString()
  @MinLength(1, { message: 'Name is required' })
  @MaxLength(100)
  readonly name!: string;
}

export async function loader({ context }: Route.LoaderArgs) {
  const athlete = requireAthlete(context);
  const routineService = context.get(routineServiceContext);
  return { routines: await routineService.list(athlete) };
}

export async function action({ request, context }: Route.ActionArgs) {
  const user = requireAthlete(context);
  const formData = await request.formData();
  const result = validateForm(CreateRoutineDto, { name: formData.get('name') });

  if (!result.success) {
    return data({ error: result.message }, { status: 400 });
  }

  // A new routine is anchored to today, so its first slot is today's - the
  // athlete can re-anchor it afterwards.
  const routineService = context.get(routineServiceContext);
  const routine = await routineService.create(user, result.data.name, DateOnly.today());

  requestLogger(context).log(`created routine ${routine.id} for user ${user.id}`, 'Routines');

  throw redirect(`/routines/${routine.id}`);
}

export default function Routines({ loaderData, actionData }: Route.ComponentProps) {
  const error = actionData && 'error' in actionData ? actionData.error : undefined;
  const { routines: routineList } = loaderData;

  return (
    <Page>
      <PageHeader
        title="Routines"
        description={
          <>
            A routine is a repeating cycle of days — each day is either one of your{' '}
            <Link
              to="/templates"
              className="font-medium text-foreground underline decoration-brand-strong decoration-2 underline-offset-4 hover:decoration-4"
            >
              templates
            </Link>{' '}
            or a rest day. Only one routine can be active at a time; the active routine drives what shows up on the Today page.
          </>
        }
      />

      <Card className="mt-(--section-gap) max-w-md">
        <CardHeader>
          <CardTitle>New routine</CardTitle>
        </CardHeader>
        <CardContent>
          <form method="post">
            <Field label="Name" error={error} action={<SubmitButton pendingLabel="Creating">Create</SubmitButton>}>
              <Input name="name" placeholder="Push/Pull/Legs" required />
            </Field>
          </form>
        </CardContent>
      </Card>

      <Section title="Your routines">
        {routineList.length === 0 ? (
          <EmptyState
            icon={RepeatIcon}
            title="No routines yet"
            description="Create one above, then add day-slots and set it active."
          />
        ) : (
          <ul className="stagger grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {routineList.map((routine) => (
              <li key={routine.id}>
                <Card interactive size="sm" className="relative h-full">
                  <CardContent className="flex h-full flex-col justify-between gap-2">
                    <span className="flex flex-wrap items-center gap-2">
                      <Link
                        to={`/routines/${routine.id}`}
                        className="font-heading font-medium after:absolute after:inset-0 after:content-['']"
                      >
                        {routine.name}
                      </Link>
                      {routine.isActive ? <Badge variant="brand">Active</Badge> : null}
                      {routine.isSample ? (
                        <Badge variant="outline">Sample</Badge>
                      ) : routine.isCustomized ? (
                        <Badge variant="secondary">Customized</Badge>
                      ) : null}
                    </span>
                    <span className="text-sm text-muted-foreground tabular-nums">
                      {routine.slotCount} day
                      {routine.slotCount === 1 ? '' : 's'}
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
