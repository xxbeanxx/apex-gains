import { Expose, Transform } from 'class-transformer';
import { IsString, MaxLength, MinLength } from 'class-validator';
import { ClipboardListIcon } from 'lucide-react';
import { Link, data, redirect } from 'react-router';

import { requireAthlete } from '~/auth/user-context';
import { Badge } from '~/components/ui/badge';
import { Page, PageHeader, Section } from '~/components/layout/page';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';
import { EmptyState } from '~/components/ui/empty-state';
import { Field } from '~/components/ui/field';
import { Input } from '~/components/ui/input';
import { SubmitButton } from '~/components/ui/submit-button';
import { requestLogger } from '~/lib/logger.server';
import { trim } from '~/lib/validate-form';
import { validateForm } from '~/lib/validate-form.server';

import { workoutServiceContext } from '~/lib/nest-bridge.server';

import type { Route } from './+types/workouts';

export function meta() {
  return [{ title: 'Workouts - Apex Gains' }];
}

export const handle = { crumb: () => ({ label: 'Workouts' }) };

class CreateWorkoutDto {
  @Expose()
  @Transform(trim())
  @IsString()
  @MinLength(1, { message: 'Name is required' })
  @MaxLength(100)
  readonly name!: string;
}

export async function loader({ context }: Route.LoaderArgs) {
  const athlete = requireAthlete(context);
  const workoutService = context.get(workoutServiceContext);
  return { workouts: await workoutService.list(athlete) };
}

export async function action({ request, context }: Route.ActionArgs) {
  const user = requireAthlete(context);
  const formData = await request.formData();
  const result = validateForm(CreateWorkoutDto, { name: formData.get('name') });

  if (!result.success) {
    return data({ error: result.message }, { status: 400 });
  }

  const workoutService = context.get(workoutServiceContext);
  const workout = await workoutService.create(user, result.data.name);

  requestLogger(context).log(`created workout ${workout.id} for user ${user.id}`, 'Workouts');

  throw redirect(`/workouts/${workout.id}`);
}

export default function Workouts({ loaderData, actionData }: Route.ComponentProps) {
  const error = actionData && 'error' in actionData ? actionData.error : undefined;
  const { workouts: workoutList } = loaderData;

  return (
    <Page>
      <PageHeader
        title="Workouts"
        description={
          <>
            A workout is a reusable list of exercises with target sets, reps, and weight — a single workout, like “Push Day” or
            “Leg Day”. Build workouts here, then arrange them into a cycle on the{' '}
            <Link
              to="/plans"
              className="font-medium text-foreground underline decoration-brand-strong decoration-2 underline-offset-4 hover:decoration-4"
            >
              Plans
            </Link>{' '}
            page.
          </>
        }
      />

      <Card className="mt-(--section-gap) max-w-md">
        <CardHeader>
          <CardTitle>New workout</CardTitle>
        </CardHeader>
        <CardContent>
          <form method="post">
            <Field label="Name" error={error} action={<SubmitButton pendingLabel="Creating">Create</SubmitButton>}>
              <Input name="name" placeholder="Push Day" required />
            </Field>
          </form>
        </CardContent>
      </Card>

      <Section title="Your workouts">
        {workoutList.length === 0 ? (
          <EmptyState
            icon={ClipboardListIcon}
            title="No workouts yet"
            description="Create one above, then fill it with exercises and targets."
          />
        ) : (
          <ul className="stagger grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {workoutList.map((workout) => (
              <li key={workout.id}>
                <Card interactive size="sm" className="relative h-full">
                  <CardContent className="flex h-full flex-col justify-between gap-2">
                    <span className="flex flex-wrap items-center gap-2">
                      <Link
                        to={`/workouts/${workout.id}`}
                        className="font-heading font-medium after:absolute after:inset-0 after:content-['']"
                      >
                        {workout.name}
                      </Link>
                      {workout.isSample ? (
                        <Badge variant="outline">Sample</Badge>
                      ) : workout.isCustomized ? (
                        <Badge variant="secondary">Customized</Badge>
                      ) : null}
                    </span>
                    <span className="text-sm text-muted-foreground tabular-nums">
                      {workout.exerciseCount} exercise
                      {workout.exerciseCount === 1 ? '' : 's'}
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
