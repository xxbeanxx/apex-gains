import { UsersIcon } from 'lucide-react';
import { Link } from 'react-router';

import { userContext } from '~/auth/user-context';
import { AccountIdentity } from '~/components/admin/account-identity';
import { Page, PageHeader, Section } from '~/components/layout/page';
import { Button } from '~/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';
import { EmptyState } from '~/components/ui/empty-state';
import { Stat } from '~/components/ui/stat';
import { formatCount, formatFullDate } from '~/lib/format';
import { adminServiceContext } from '~/lib/nest-bridge.server';
import type { AdminAccountView } from '~/services/admin-service.server';

import type { Route } from './+types/admin';

export function meta() {
  return [{ title: 'Admin - Apex Gains' }];
}

export async function loader({ context }: Route.LoaderArgs) {
  const administrator = context.get(userContext)!;
  return { overview: await context.get(adminServiceContext).overview(administrator) };
}

/** A shortlist row: who, and the one number the list is sorted by. */
function AccountRow({ account, measure }: { account: AdminAccountView; measure: React.ReactNode }) {
  return (
    <li className="relative flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-3 py-2.5 transition-colors duration-(--dur) hover:border-ring/30">
      <AccountIdentity account={account} stretched />
      <span className="shrink-0 text-sm text-muted-foreground tabular-nums">{measure}</span>
    </li>
  );
}

export default function AdminDashboard({ loaderData }: Route.ComponentProps) {
  const { overview } = loaderData;
  const windowLabel = `last ${overview.recentWindowDays} days`;

  return (
    <Page>
      <PageHeader
        title="Admin"
        description="Everything logged on this instance, across every account."
        actions={
          <Button asChild variant="outline" size="sm">
            <Link to="/admin/users">
              <UsersIcon aria-hidden="true" />
              Manage users
            </Link>
          </Button>
        }
      />

      <div className="mt-(--section-gap) grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Stat
          label="Accounts"
          value={formatCount(overview.totalAccounts)}
          hint={`${formatCount(overview.administrators)} with admin access`}
        />
        <Stat label="New sign-ups" value={formatCount(overview.joinedRecently)} hint={windowLabel} />
        <Stat
          label="Active athletes"
          value={formatCount(overview.activeRecently)}
          hint={`logged a day in the ${windowLabel}`}
        />
        <Stat label="Workouts logged" value={formatCount(overview.totalWorkouts)} hint="rest days excluded" />
        <Stat label="Sets logged" value={formatCount(overview.totalSets)} hint="all time" />
        <Stat
          label="Sets per workout"
          value={overview.totalWorkouts === 0 ? '—' : (overview.totalSets / overview.totalWorkouts).toFixed(1)}
          hint="across the instance"
        />
      </div>

      <div className="grid gap-(--section-gap) lg:grid-cols-2">
        <Section title="Newest accounts" description="The most recent sign-ups, newest first.">
          {overview.newestAccounts.length === 0 ? (
            <EmptyState icon={UsersIcon} title="No accounts yet" compact />
          ) : (
            <ul className="grid gap-3">
              {overview.newestAccounts.map((account) => (
                <AccountRow key={account.id} account={account} measure={`Joined ${formatFullDate(account.joinedOn)}`} />
              ))}
            </ul>
          )}
        </Section>

        <Section title="Busiest athletes" description="By total sets logged.">
          {overview.busiestAccounts.length === 0 ? (
            <EmptyState
              icon={UsersIcon}
              title="Nothing logged yet"
              description="This fills in once someone records their first set."
              compact
            />
          ) : (
            <ul className="grid gap-3">
              {overview.busiestAccounts.map((account) => (
                <AccountRow
                  key={account.id}
                  account={account}
                  measure={`${formatCount(account.setCount)} set${account.setCount === 1 ? '' : 's'}`}
                />
              ))}
            </ul>
          )}
        </Section>
      </div>

      <Card className="mt-(--section-gap)">
        <CardHeader>
          <CardTitle>About admin access</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm text-muted-foreground">
          <p>
            Sign-up is open, so anyone with a Google account can create one here. Administrators are the exception: access is
            only ever granted by another administrator, from the{' '}
            <Link
              to="/admin/users"
              className="font-medium text-foreground underline decoration-brand-strong decoration-2 underline-offset-4 hover:decoration-4"
            >
              user manager
            </Link>
            .
          </p>
          <p>
            You cannot change or delete your own account from here. That restriction is also what keeps this area reachable —
            since every change lands on someone else, whoever makes it is still an administrator afterwards.
          </p>
        </CardContent>
      </Card>
    </Page>
  );
}
