import { Expose } from 'class-transformer';
import { IsIn, IsUUID } from 'class-validator';
import { ShieldCheckIcon, ShieldOffIcon, UsersIcon } from 'lucide-react';
import { Form, Link, data } from 'react-router';

import { requireAthlete } from '~/auth/user-context';
import { AccountIdentity } from '~/components/admin/account-identity';
import { Page, PageHeader } from '~/components/layout/page';
import { Button } from '~/components/ui/button';
import { EmptyState } from '~/components/ui/empty-state';
import { Field } from '~/components/ui/field';
import { Input } from '~/components/ui/input';
import { SubmitButton } from '~/components/ui/submit-button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '~/components/ui/table';
import { formatCount, formatFullDate } from '~/lib/format';
import { requestLogger } from '~/lib/logger.server';
import { validateForm } from '~/lib/validate-form.server';

import { adminServiceContext } from '~/lib/nest-bridge.server';

import type { Route } from './+types/admin.users';

export function meta() {
  return [{ title: 'Users - Apex Gains' }];
}

export const handle = {
  crumb: () => [{ label: 'Admin', to: '/admin' }, { label: 'Users' }],
};

class ChangeAdminAccessDto {
  @Expose()
  @IsUUID()
  readonly userId!: string;

  @Expose()
  @IsIn(['true', 'false'])
  readonly isAdmin!: 'true' | 'false';
}

/**
 * The search box is a plain GET form, so the query lives in the URL: a
 * filtered list is a shareable, reloadable, back-buttonable page, and the
 * table stays server-rendered like every other list in the app.
 */
export async function loader({ request, context }: Route.LoaderArgs) {
  const administrator = requireAthlete(context);
  const query = new URL(request.url).searchParams.get('q')?.trim() ?? '';

  const accounts = await context.get(adminServiceContext).accounts(administrator);
  const needle = query.toLowerCase();

  return {
    query,
    total: accounts.length,
    accounts: needle
      ? accounts.filter(
          (account) => account.name.toLowerCase().includes(needle) || account.email.toLowerCase().includes(needle),
        )
      : accounts,
  };
}

export async function action({ request, context }: Route.ActionArgs) {
  const administrator = requireAthlete(context);
  const formData = await request.formData();

  const result = validateForm(ChangeAdminAccessDto, {
    userId: formData.get('userId'),
    isAdmin: formData.get('isAdmin'),
  });
  if (!result.success) {
    return data({ error: result.message }, { status: 400 });
  }

  const isAdmin = result.data.isAdmin === 'true';
  const outcome = await context.get(adminServiceContext).changeAdminAccess(administrator, result.data.userId, isAdmin);

  if (!outcome.ok) {
    if (outcome.error === 'not-found') {
      throw data('User not found', { status: 404 });
    }
    return data({ error: 'You cannot change your own admin access.' }, { status: 400 });
  }

  requestLogger(context).log(
    `${isAdmin ? 'granted' : 'revoked'} admin access for user ${result.data.userId} by ${administrator.id}`,
    'Admin',
  );

  return { ok: true, name: outcome.value.name, isAdmin } as const;
}

export default function AdminUsers({ loaderData, actionData }: Route.ComponentProps) {
  const { accounts, query, total } = loaderData;
  const error = actionData && 'error' in actionData ? actionData.error : undefined;
  const confirmation = actionData && 'ok' in actionData ? actionData : undefined;

  return (
    <Page>
      <PageHeader
        title="Users"
        description="Every account on this instance. Granting admin access gives someone this page and everything on it."
      />

      <Form method="get" className="mt-(--section-gap) max-w-md">
        <Field label="Search" error={error} action={<Button type="submit">Search</Button>}>
          <Input name="q" type="search" defaultValue={query} placeholder="Name or email" />
        </Field>
      </Form>

      <div aria-live="polite" className="mt-4 empty:hidden">
        {confirmation ? (
          <p className="animate-fade-in text-sm font-medium text-success">
            {confirmation.isAdmin ? 'Granted' : 'Revoked'} admin access {confirmation.isAdmin ? 'to' : 'from'}{' '}
            {confirmation.name}.
          </p>
        ) : null}
      </div>

      <p className="mt-4 text-sm text-muted-foreground">
        {query ? (
          <>
            {formatCount(accounts.length)} of {formatCount(total)} account{total === 1 ? '' : 's'} matching “{query}”.{' '}
            <Link to="/admin/users" className="font-medium text-foreground underline underline-offset-4">
              Clear
            </Link>
          </>
        ) : (
          <>
            {formatCount(total)} account{total === 1 ? '' : 's'}.
          </>
        )}
      </p>

      {accounts.length === 0 ? (
        <EmptyState
          className="mt-4"
          icon={UsersIcon}
          title={query ? 'No matching accounts' : 'No accounts yet'}
          description={query ? 'Try a different name or email.' : undefined}
        />
      ) : (
        <div className="mt-4 rounded-xl border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="px-3">Account</TableHead>
                <TableHead className="px-3">Joined</TableHead>
                <TableHead className="px-3">Last active</TableHead>
                <TableHead className="px-3 text-right">Workouts</TableHead>
                <TableHead className="px-3 text-right">Sets</TableHead>
                <TableHead className="px-3 text-right">Admin</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {accounts.map((account) => (
                <TableRow key={account.id}>
                  <TableCell className="relative px-3 py-2.5">
                    <AccountIdentity account={account} stretched />
                  </TableCell>
                  <TableCell className="px-3 text-muted-foreground">{formatFullDate(account.joinedOn)}</TableCell>
                  <TableCell className="px-3 text-muted-foreground">
                    {account.lastActiveOn ? formatFullDate(account.lastActiveOn) : 'Never'}
                  </TableCell>
                  <TableCell className="px-3 text-right tabular-nums">{formatCount(account.workoutCount)}</TableCell>
                  <TableCell className="px-3 text-right tabular-nums">{formatCount(account.setCount)}</TableCell>
                  <TableCell className="px-3 text-right">
                    {
                      // No control on your own row: `changeAdminAccess` in the
                      // domain refuses it, and the guarantee that at least one
                      // administrator always remains rests on that.
                      account.isSelf ? (
                        <span className="text-sm text-muted-foreground">—</span>
                      ) : (
                        <form method="post">
                          <input type="hidden" name="userId" value={account.id} />
                          <input type="hidden" name="isAdmin" value={account.isAdmin ? 'false' : 'true'} />
                          <SubmitButton variant="ghost" size="sm" match={{ userId: account.id }} pendingLabel="Updating access">
                            {account.isAdmin ? (
                              <>
                                <ShieldOffIcon aria-hidden="true" />
                                Revoke
                              </>
                            ) : (
                              <>
                                <ShieldCheckIcon aria-hidden="true" />
                                Grant
                              </>
                            )}
                            <span className="sr-only"> admin access for {account.name}</span>
                          </SubmitButton>
                        </form>
                      )
                    }
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </Page>
  );
}
