import { GaugeIcon, UsersIcon } from 'lucide-react';
import { NavLink, Outlet } from 'react-router';

import { requireAdminMiddleware } from '~/auth/require-admin.server';
import { cn } from '~/lib/utils';

import type { Route } from './+types/_admin';

export const middleware: Route.MiddlewareFunction[] = [requireAdminMiddleware];

const ADMIN_NAV = [
  { to: '/admin', label: 'Dashboard', icon: GaugeIcon },
  { to: '/admin/users', label: 'Users', icon: UsersIcon },
];

/**
 * The administrator's area. Nested inside `_protected`, so the only thing it
 * adds is the admin check - by the time this layout matches, a signed-in
 * athlete is already guaranteed.
 */
export default function AdminLayout() {
  return (
    <>
      <div className="border-b border-border bg-muted/40">
        <nav aria-label="Admin" className="mx-auto flex max-w-(--content-max) items-center gap-1 px-(--page-px)">
          {ADMIN_NAV.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              // `end` on the dashboard only: without it every /admin/* URL
              // would light up the dashboard tab as well as its own.
              end={to === '/admin'}
              className={({ isActive }) =>
                cn(
                  'relative flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium transition-colors duration-(--dur-fast)',
                  isActive ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <Icon className="size-4" aria-hidden="true" />
                  {label}
                  <span
                    aria-hidden="true"
                    className={cn(
                      'absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-brand-strong transition-opacity duration-(--dur)',
                      isActive ? 'opacity-100' : 'opacity-0',
                    )}
                  />
                </>
              )}
            </NavLink>
          ))}
        </nav>
      </div>
      <Outlet />
    </>
  );
}
