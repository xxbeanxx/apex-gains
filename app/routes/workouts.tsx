import { Expose, Transform } from 'class-transformer';
import { IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { ClipboardListIcon, CopyIcon, EllipsisIcon, PlusIcon } from 'lucide-react';
import { Link, redirect, useSubmit } from 'react-router';

import { requireAthlete } from '~/auth/user-context';
import { OwnershipBadge } from '~/components/forkable-header';
import { Page, PageHeader, Section } from '~/components/layout/page';
import { Button } from '~/components/ui/button';
import { Card, CardContent } from '~/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '~/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '~/components/ui/dropdown-menu';
import { EmptyState } from '~/components/ui/empty-state';
import { Field } from '~/components/ui/field';
import { Input } from '~/components/ui/input';
import { SubmitButton } from '~/components/ui/submit-button';
import { requestLogger } from '~/lib/logger.server';
import { intent } from '~/lib/intent';
import { dispatch, handled } from '~/lib/intent.server';
import { trim } from '~/lib/validate-form';
import type { WorkoutSummary } from '~/services/workout-service.server';

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

class WorkoutIdDto {
  @Expose()
  @IsUUID()
  readonly workoutId!: string;
}

const intents = {
  create: intent('create', CreateWorkoutDto),
  duplicate: intent('duplicate', WorkoutIdDto),
};

export async function loader({ context }: Route.LoaderArgs) {
  const athlete = requireAthlete(context);
  const workoutService = context.get(workoutServiceContext);
  return { workouts: await workoutService.list(athlete) };
}

export async function action({ request, context }: Route.ActionArgs) {
  const user = requireAthlete(context);
  const workoutService = context.get(workoutServiceContext);

  return dispatch(request, [
    handled(intents.create, async ({ name }) => {
      const workout = await workoutService.create(user, name);
      requestLogger(context).log(`created workout ${workout.id} for user ${user.id}`, 'Workouts');
      throw redirect(`/workouts/${workout.id}`);
    }),

    handled(intents.duplicate, async ({ workoutId }) => {
      const outcome = await workoutService.duplicate(user, workoutId);
      // A stale row - since deleted or since out of view - is a no-op back
      // to the list rather than an error, same as a stale form anywhere
      // else in the builders.
      if (!outcome.ok) throw redirect('/workouts');

      requestLogger(context).log(`duplicated workout ${workoutId} into ${outcome.value.id} for user ${user.id}`, 'Workouts');
      throw redirect(`/workouts/${outcome.value.id}`);
    }),
  ]);
}

/** The `⋯` menu every workout card ends in: duplicating it. */
function WorkoutRowMenu({ workout }: { workout: WorkoutSummary }) {
  const submit = useSubmit();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {
          // `relative` so this sits above the card-covering Link overlay in
          // paint order - a positioned sibling later in the DOM beats an
          // absolutely-positioned one earlier, but only once it is itself
          // positioned.
        }
        <Button variant="ghost" size="icon-sm" className="relative ml-auto shrink-0" aria-label={`Actions for ${workout.name}`}>
          <EllipsisIcon aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          onSelect={() => submit({ intent: intents.duplicate.name, workoutId: workout.id }, { method: 'post' })}
        >
          <CopyIcon aria-hidden="true" />
          Duplicate
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default function Workouts({ loaderData, actionData }: Route.ComponentProps) {
  const error = intents.create.errorIn(actionData);
  const { workouts: workoutList } = loaderData;

  const createForm = (
    <form method="post">
      <input {...intents.create.field} />
      <Field
        label="Name"
        error={error}
        action={
          <SubmitButton match={intents.create.match} pendingLabel="Creating">
            Create
          </SubmitButton>
        }
      >
        <Input name="name" placeholder="Push Day" required />
      </Field>
    </form>
  );

  return (
    <Dialog defaultOpen={Boolean(error)}>
      <Page>
        <PageHeader
          title="Workouts"
          description={
            <>
              A workout is a reusable list of exercises with target sets, reps, and weight — a single workout, like “Push Day”
              or “Leg Day”. Build workouts here, then arrange them into a cycle on the{' '}
              <Link
                to="/plans"
                className="font-medium text-foreground underline decoration-brand-strong decoration-2 underline-offset-4 hover:decoration-4"
              >
                Plans
              </Link>{' '}
              page.
            </>
          }
          actions={
            <DialogTrigger asChild>
              <Button variant="brand">
                <PlusIcon aria-hidden="true" />
                New workout
              </Button>
            </DialogTrigger>
          }
        />

        <Section title="Your workouts">
          {workoutList.length === 0 ? (
            <EmptyState
              icon={ClipboardListIcon}
              title="No workouts yet"
              description="Create one, then fill it with exercises and targets."
              action={
                <DialogTrigger asChild>
                  <Button variant="outline">
                    <PlusIcon aria-hidden="true" />
                    New workout
                  </Button>
                </DialogTrigger>
              }
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
                        <OwnershipBadge isSample={workout.isSample} isCustomized={workout.isCustomized} />
                        <WorkoutRowMenu workout={workout} />
                      </span>
                      <span className="text-sm text-muted-foreground tabular-nums">
                        {workout.exerciseCount} exercise
                        {workout.exerciseCount === 1 ? '' : 's'}
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
                    New workout
                  </button>
                </DialogTrigger>
              </li>
            </ul>
          )}
        </Section>
      </Page>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>New workout</DialogTitle>
        </DialogHeader>
        {createForm}
      </DialogContent>
    </Dialog>
  );
}
