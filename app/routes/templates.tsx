import { ClipboardListIcon } from 'lucide-react';
import { Link, data, redirect } from 'react-router';
import { z } from 'zod';

import { userContext } from '~/auth/user-context';
import { Badge } from '~/components/ui/badge';
import { Page, PageHeader, Section } from '~/components/layout/page';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';
import { EmptyState } from '~/components/ui/empty-state';
import { Field } from '~/components/ui/field';
import { Input } from '~/components/ui/input';
import { SubmitButton } from '~/components/ui/submit-button';
import { requestLogger } from '~/lib/logger.server';

import { templateServiceContext } from '~/lib/nest-bridge.server';

import type { Route } from './+types/templates';

export function meta() {
  return [{ title: 'Templates - Apex Gains' }];
}

const createTemplateSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(100),
});

export async function loader({ context }: Route.LoaderArgs) {
  const athlete = context.get(userContext)!;
  const templateService = context.get(templateServiceContext);
  return { templates: await templateService.list(athlete) };
}

export async function action({ request, context }: Route.ActionArgs) {
  const user = context.get(userContext)!;
  const formData = await request.formData();
  const result = createTemplateSchema.safeParse({
    name: formData.get('name'),
  });

  if (!result.success) {
    return data({ error: result.error.issues[0]?.message ?? 'Invalid name' }, { status: 400 });
  }

  const templateService = context.get(templateServiceContext);
  const template = await templateService.create(user, result.data.name);

  requestLogger(context).log(`created template ${template.id} for user ${user.id}`, 'Templates');

  throw redirect(`/templates/${template.id}`);
}

export default function Templates({ loaderData, actionData }: Route.ComponentProps) {
  const error = actionData && 'error' in actionData ? actionData.error : undefined;
  const { templates: templateList } = loaderData;

  return (
    <Page>
      <PageHeader
        title="Templates"
        description={
          <>
            A template is a reusable list of exercises with target sets, reps, and weight — a single workout, like “Push Day” or
            “Leg Day”. Build templates here, then arrange them into a cycle on the{' '}
            <Link
              to="/routines"
              className="font-medium text-foreground underline decoration-brand-strong decoration-2 underline-offset-4 hover:decoration-4"
            >
              Routines
            </Link>{' '}
            page.
          </>
        }
      />

      <Card className="mt-(--section-gap) max-w-md">
        <CardHeader>
          <CardTitle>New template</CardTitle>
        </CardHeader>
        <CardContent>
          <form method="post">
            <Field label="Name" error={error} action={<SubmitButton pendingLabel="Creating">Create</SubmitButton>}>
              <Input name="name" placeholder="Push Day" required />
            </Field>
          </form>
        </CardContent>
      </Card>

      <Section title="Your templates">
        {templateList.length === 0 ? (
          <EmptyState
            icon={ClipboardListIcon}
            title="No templates yet"
            description="Create one above, then fill it with exercises and targets."
          />
        ) : (
          <ul className="stagger grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {templateList.map((template) => (
              <li key={template.id}>
                <Card interactive size="sm" className="relative h-full">
                  <CardContent className="flex h-full flex-col justify-between gap-2">
                    <span className="flex flex-wrap items-center gap-2">
                      <Link
                        to={`/templates/${template.id}`}
                        className="font-heading font-medium after:absolute after:inset-0 after:content-['']"
                      >
                        {template.name}
                      </Link>
                      {template.isSample ? (
                        <Badge variant="outline">Sample</Badge>
                      ) : template.isCustomized ? (
                        <Badge variant="secondary">Customized</Badge>
                      ) : null}
                    </span>
                    <span className="text-sm text-muted-foreground tabular-nums">
                      {template.exerciseCount} exercise
                      {template.exerciseCount === 1 ? '' : 's'}
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
