import { Expose } from 'class-transformer';
import { IsIn, IsString } from 'class-validator';
import { ArrowLeftIcon, ShieldCheckIcon, ShieldOffIcon, Trash2Icon } from 'lucide-react';
import { Link, data, redirect } from 'react-router';

import { userContext } from '~/auth/user-context';
import { Page, PageHeader } from '~/components/layout/page';
import { Avatar } from '~/components/ui/avatar';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card';
import { Field } from '~/components/ui/field';
import { Input } from '~/components/ui/input';
import { Stat } from '~/components/ui/stat';
import { SubmitButton } from '~/components/ui/submit-button';
import { formatCount, formatFullDate } from '~/lib/format';
import { requestLogger } from '~/lib/logger.server';
import { validateForm } from '~/lib/validate-form.server';

import { adminServiceContext } from '~/lib/nest-bridge.server';

import type { Route } from './+types/admin.users.$userId';

export function meta({ loaderData }: Route.MetaArgs) {
  return [{ title: `${loaderData?.account.name ?? 'User'} - Apex Gains` }];
}

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

export async function loader({ params, context }: Route.LoaderArgs) {
  const administrator = context.get(userContext)!;
  const account = await context.get(adminServiceContext).account(administrator, params.userId);
  if (!account) {
    throw data('User not found', { status: 404 });
  }
  return { account };
}

export async function action({ request, params, context }: Route.ActionArgs) {
  const administrator = context.get(userContext)!;
  const adminService = context.get(adminServiceContext);
  const formData = await request.formData();
  const intent = formData.get('intent');

  if (intent === 'changeAdminAccess') {
    const result = validateForm(ChangeAdminAccessDto, { isAdmin: formData.get('isAdmin') });
    if (!result.success) {
      return data({ error: result.message, intent: 'changeAdminAccess' }, { status: 400 });
    }

    const isAdmin = result.data.isAdmin === 'true';
    const outcome = await adminService.changeAdminAccess(administrator, params.userId, isAdmin);
    if (!outcome.ok) {
      if (outcome.error === 'not-found') throw data('User not found', { status: 404 });
      return data({ error: 'You cannot change your own admin access.', intent: 'changeAdminAccess' }, { status: 400 });
    }

    requestLogger(context).log(
      `${isAdmin ? 'granted' : 'revoked'} admin access for user ${params.userId} by ${administrator.id}`,
      'Admin',
    );
    return { ok: true, intent: 'changeAdminAccess' } as const;
  }

  if (intent === 'deleteAccount') {
    const result = validateForm(DeleteAccountDto, { confirmEmail: formData.get('confirmEmail') });
    const account = await adminService.account(administrator, params.userId);
    if (!account) {
      throw data('User not found', { status: 404 });
    }

    // The typed email is the confirmation step: this deletes an athlete's
    // entire training history along with the account, and there is no undo.
    if (!result.success || result.data.confirmEmail.trim().toLowerCase() !== account.email.toLowerCase()) {
      return data({ error: "That doesn't match this account's email address.", intent: 'deleteAccount' }, { status: 400 });
    }

    const outcome = await adminService.removeAccount(administrator, params.userId);
    if (!outcome.ok) {
      if (outcome.error === 'not-found') throw data('User not found', { status: 404 });
      return data({ error: 'You cannot delete your own account.', intent: 'deleteAccount' }, { status: 400 });
    }

    requestLogger(context).log(`deleted user ${params.userId} by ${administrator.id}`, 'Admin');
    throw redirect('/admin/users');
  }

  return data({ error: 'Unknown action', intent: 'unknown' }, { status: 400 });
}

export default function AdminUserDetail({ loaderData, actionData }: Route.ComponentProps) {
  const { account } = loaderData;

  const errorFor = (matchIntent: string) =>
    actionData && 'error' in actionData && actionData.intent === matchIntent ? actionData.error : undefined;

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

      <Card className="mt-(--section-gap)">
        <CardHeader>
          <CardTitle>Preferences</CardTitle>
          <CardDescription>What this athlete chose on their own settings page. Only they can change it.</CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-3 text-sm sm:grid-cols-3">
            <div className="flex flex-col gap-0.5">
              <dt className="text-muted-foreground">Weight</dt>
              <dd className="font-medium">{account.weightUnit === 'lb' ? 'Pounds (lb)' : 'Kilograms (kg)'}</dd>
            </div>
            <div className="flex flex-col gap-0.5">
              <dt className="text-muted-foreground">Distance & speed</dt>
              <dd className="font-medium">{account.distanceUnit === 'km' ? 'Kilometers (km/h)' : 'Miles (mph)'}</dd>
            </div>
            <div className="flex flex-col gap-0.5">
              <dt className="text-muted-foreground">Sample data</dt>
              <dd className="font-medium">{account.showSampleData ? 'Shown' : 'Hidden'}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      {account.isSelf ? (
        <Card className="mt-(--section-gap)">
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
      ) : (
        <>
          <Card className="mt-(--section-gap)">
            <CardHeader>
              <CardTitle>Admin access</CardTitle>
              <CardDescription>
                {account.isAdmin
                  ? `${account.name} can see this area and every account in it.`
                  : `${account.name} is an ordinary athlete and can only see their own data.`}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              <form method="post">
                <input type="hidden" name="intent" value="changeAdminAccess" />
                <input type="hidden" name="isAdmin" value={account.isAdmin ? 'false' : 'true'} />
                <SubmitButton
                  variant={account.isAdmin ? 'outline' : 'brand'}
                  match={{ intent: 'changeAdminAccess' }}
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
              </form>
              <div aria-live="polite" className="empty:hidden">
                {errorFor('changeAdminAccess') ? (
                  <p className="text-sm font-medium text-destructive">{errorFor('changeAdminAccess')}</p>
                ) : actionData && 'ok' in actionData && actionData.intent === 'changeAdminAccess' ? (
                  <p className="animate-fade-in text-sm font-medium text-success">Saved.</p>
                ) : null}
              </div>
            </CardContent>
          </Card>

          <Card className="mt-(--section-gap) border-destructive/30">
            <CardHeader>
              <CardTitle>Delete account</CardTitle>
              <CardDescription>
                Removes {account.name} along with every exercise, template, routine, workout and weigh-in they own —{' '}
                {formatCount(account.setCount)} logged set{account.setCount === 1 ? '' : 's'} included. This cannot be undone.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form method="post">
                <input type="hidden" name="intent" value="deleteAccount" />
                <Field
                  label="Type the account's email to confirm"
                  description={account.email}
                  error={errorFor('deleteAccount')}
                  action={
                    <SubmitButton variant="destructive" match={{ intent: 'deleteAccount' }} pendingLabel="Deleting account">
                      <Trash2Icon aria-hidden="true" />
                      Delete
                    </SubmitButton>
                  }
                >
                  <Input name="confirmEmail" type="email" autoComplete="off" required />
                </Field>
              </form>
            </CardContent>
          </Card>
        </>
      )}
    </Page>
  );
}
