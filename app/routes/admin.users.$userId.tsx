import { Form, Link, data, redirect } from 'react-router';

import { Expose } from 'class-transformer';
import { IsIn, IsString } from 'class-validator';
import { ArrowLeftIcon, ShieldCheckIcon, ShieldOffIcon, Trash2Icon } from 'lucide-react';

import { requireAthlete } from '~/auth/user-context';
import { Page, PageHeader } from '~/components/layout/page';
import { type TabSection, TabShell } from '~/components/layout/tab-shell';
import { Avatar } from '~/components/ui/avatar';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card';
import { Field } from '~/components/ui/field';
import { Input } from '~/components/ui/input';
import { Stat } from '~/components/ui/stat';
import { SubmitButton } from '~/components/ui/submit-button';
import { intent } from '~/lib/intent';
import { dispatch, handled } from '~/lib/intent.server';
import { requestLogger } from '~/lib/logger';
import { adminServiceContext } from '~/router/load-context';
import { formatCount, formatFullDate } from '~shared/format';

import type { Route } from './+types/admin.users.$userId';

export function meta({ loaderData }: Route.MetaArgs) {
  return [{ title: `${loaderData?.account.name ?? 'User'} - Apex Gains` }];
}

export const handle = {
  crumb: (data: Awaited<ReturnType<typeof loader>>) => [
    { label: 'Admin', to: '/admin' },
    { label: 'Users', to: '/admin/users' },
    { label: data.account.name },
  ],
};

class ChangeAdminAccessDto {
  @Expose()
  @IsIn(['true', 'false'])
  readonly isAdmin!: 'true' | 'false';
}

class DeleteAccountDto {
  @Expose()
  @IsString()
  readonly confirmEmail!: string;
}

export async function loader({ params, request, context }: Route.LoaderArgs) {
  const administrator = requireAthlete(context);
  const account = await context.get(adminServiceContext).account(administrator, params.userId);
  if (!account) {
    throw data('User not found', { status: 404 });
  }

  const validIds = account.isSelf ? ['preferences', 'account'] : ['preferences', 'access', 'delete'];
  const requested = new URL(request.url).searchParams.get('section');
  const section = requested && validIds.includes(requested) ? requested : 'preferences';

  return { account, section };
}

const intents = {
  changeAdminAccess: intent('changeAdminAccess', ChangeAdminAccessDto),
  deleteAccount: intent('deleteAccount', DeleteAccountDto, {
    // The message is the same whether the field was blank or simply wrong -
    // the confirmation is about deliberateness, not about spelling.
    invalidMessage: "That doesn't match this account's email address.",
  }),
};

export async function action({ request, params, context }: Route.ActionArgs) {
  const administrator = requireAthlete(context);
  const adminService = context.get(adminServiceContext);

  return dispatch(request, [
    handled(intents.changeAdminAccess, async ({ isAdmin }) => {
      const granting = isAdmin === 'true';
      const outcome = await adminService.changeAdminAccess(administrator, params.userId, granting);
      if (!outcome.ok) {
        if (outcome.error === 'not-found') throw data('User not found', { status: 404 });
        return intents.changeAdminAccess.reject('You cannot change your own admin access.');
      }

      requestLogger(context).log(
        `${granting ? 'granted' : 'revoked'} admin access for user ${params.userId} by ${administrator.id}`,
        'Admin',
      );
      return { ok: true, intent: intents.changeAdminAccess.name } as const;
    }),

    handled(intents.deleteAccount, async ({ confirmEmail }) => {
      const account = await adminService.account(administrator, params.userId);
      if (!account) {
        throw data('User not found', { status: 404 });
      }

      // The typed email is the confirmation step: this deletes an athlete's
      // entire training history along with the account, and there is no undo.
      if (confirmEmail.trim().toLowerCase() !== account.email.toLowerCase()) {
        return intents.deleteAccount.reject("That doesn't match this account's email address.");
      }

      const outcome = await adminService.removeAccount(administrator, params.userId);
      if (!outcome.ok) {
        if (outcome.error === 'not-found') throw data('User not found', { status: 404 });
        return intents.deleteAccount.reject('You cannot delete your own account.');
      }

      requestLogger(context).log(`deleted user ${params.userId} by ${administrator.id}`, 'Admin');
      throw redirect('/admin/users');
    }),
  ]);
}

export default function AdminUserDetail({ loaderData, actionData }: Route.ComponentProps) {
  const { account } = loaderData;

  const preferences: TabSection = {
    id: 'preferences',
    label: 'Preferences',
    content: (
      <Card>
        <CardHeader>
          <CardTitle>Preferences</CardTitle>
          <CardDescription>What this athlete chose on their own settings page. Only they can change it.</CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-3 text-sm sm:grid-cols-4">
            <div className="flex flex-col gap-0.5">
              <dt className="text-muted-foreground">Weight</dt>
              <dd className="font-medium">{account.weightUnit === 'lb' ? 'Pounds (lb)' : 'Kilograms (kg)'}</dd>
            </div>
            <div className="flex flex-col gap-0.5">
              <dt className="text-muted-foreground">Distance & speed</dt>
              <dd className="font-medium">{account.distanceUnit === 'km' ? 'Kilometers (km/h)' : 'Miles (mph)'}</dd>
            </div>
            <div className="flex flex-col gap-0.5">
              <dt className="text-muted-foreground">Body measurements</dt>
              <dd className="font-medium">{account.lengthUnit === 'cm' ? 'Centimeters (cm)' : 'Inches (in)'}</dd>
            </div>
            <div className="flex flex-col gap-0.5">
              <dt className="text-muted-foreground">Sample data</dt>
              <dd className="font-medium">{account.showSampleData ? 'Shown' : 'Hidden'}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>
    ),
  };

  const sections: TabSection[] = account.isSelf
    ? [
        preferences,
        {
          id: 'account',
          label: 'Your account',
          content: (
            <Card>
              <CardHeader>
                <CardTitle>Your own account</CardTitle>
                <CardDescription>
                  An administrator can act on any account but their own, so there is nothing to do here. That is what guarantees
                  this instance always has at least one administrator left. Your training preferences live on{' '}
                  <Link
                    to="/settings"
                    className="font-medium text-foreground underline decoration-brand-strong decoration-2 underline-offset-4 hover:decoration-4"
                  >
                    your settings page
                  </Link>
                  .
                </CardDescription>
              </CardHeader>
            </Card>
          ),
        },
      ]
    : [
        preferences,
        {
          id: 'access',
          label: 'Admin access',
          content: (
            <Card>
              <CardHeader>
                <CardTitle>Admin access</CardTitle>
                <CardDescription>
                  {account.isAdmin
                    ? `${account.name} can see this area and every account in it.`
                    : `${account.name} is an ordinary athlete and can only see their own data.`}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                <Form method="post">
                  <input {...intents.changeAdminAccess.field} />
                  <input type="hidden" name="isAdmin" value={account.isAdmin ? 'false' : 'true'} />
                  <SubmitButton
                    variant={account.isAdmin ? 'outline' : 'brand'}
                    match={intents.changeAdminAccess.match}
                    pendingLabel="Updating access"
                  >
                    {account.isAdmin ? (
                      <>
                        <ShieldOffIcon aria-hidden="true" />
                        Revoke admin access
                      </>
                    ) : (
                      <>
                        <ShieldCheckIcon aria-hidden="true" />
                        Grant admin access
                      </>
                    )}
                  </SubmitButton>
                </Form>
                <div aria-live="polite" className="empty:hidden">
                  {intents.changeAdminAccess.errorIn(actionData) ? (
                    <p className="text-sm font-medium text-destructive">{intents.changeAdminAccess.errorIn(actionData)}</p>
                  ) : actionData && 'ok' in actionData && actionData.intent === 'changeAdminAccess' ? (
                    <p className="animate-fade-in text-sm font-medium text-success">Saved.</p>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          ),
        },
        {
          id: 'delete',
          label: 'Delete account',
          content: (
            <Card className="border-destructive/30">
              <CardHeader>
                <CardTitle>Delete account</CardTitle>
                <CardDescription>
                  Removes {account.name} along with every exercise, workout, plan, workout and weigh-in they own —{' '}
                  {formatCount(account.setCount)} logged set{account.setCount === 1 ? '' : 's'} included. This cannot be undone.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Form method="post">
                  <input {...intents.deleteAccount.field} />
                  <Field
                    label="Type the account's email to confirm"
                    description={account.email}
                    error={intents.deleteAccount.errorIn(actionData)}
                    action={
                      <SubmitButton variant="destructive" match={intents.deleteAccount.match} pendingLabel="Deleting account">
                        <Trash2Icon aria-hidden="true" />
                        Delete
                      </SubmitButton>
                    }
                  >
                    <Input name="confirmEmail" type="email" autoComplete="off" required />
                  </Field>
                </Form>
              </CardContent>
            </Card>
          ),
        },
      ];

  return (
    <Page width="narrow">
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            <Avatar name={account.name} src={account.avatarUrl} size={40} />
            {account.name}
          </span>
        }
        badge={
          <>
            {account.isAdmin ? <Badge variant="brand-subtle">Admin</Badge> : null}
            {account.isSelf ? <Badge variant="outline">You</Badge> : null}
          </>
        }
        description={account.email}
        actions={
          <Button asChild variant="outline" size="sm">
            <Link to="/admin/users">
              <ArrowLeftIcon aria-hidden="true" />
              All users
            </Link>
          </Button>
        }
      />

      <div className="mt-(--section-gap) grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Workouts" value={formatCount(account.workoutCount)} hint="rest days excluded" />
        <Stat label="Sets logged" value={formatCount(account.setCount)} hint="all time" />
        <Stat label="Joined" value={formatFullDate(account.joinedOn)} />
        <Stat label="Last active" value={account.lastActiveOn ? formatFullDate(account.lastActiveOn) : 'Never'} />
      </div>

      <div className="mt-(--section-gap)">
        <TabShell
          sections={sections}
          activeId={loaderData.section}
          hrefFor={(id) => `/admin/users/${account.id}?section=${id}`}
          ariaLabel="Account sections"
        />
      </div>
    </Page>
  );
}
