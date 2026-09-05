import { LogOutIcon, MoreHorizontalIcon } from 'lucide-react';
import { NavLink, useSubmit } from 'react-router';

import { Avatar } from '~/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '~/components/ui/dropdown-menu';
import { cn } from '~/lib/utils';

import type { NavItem, NavUser } from './nav-items';

function TabCell({ children, isActive, label }: { children: React.ReactNode; isActive: boolean; label: string }) {
  return (
    <span
      aria-hidden={!isActive}
      className={cn(
        'flex min-h-11 flex-1 flex-col items-center justify-center gap-0.5 text-[0.6875rem]',
        isActive ? 'text-brand-strong' : 'text-muted-foreground',
      )}
    >
      {children}
      <span className="truncate">{label}</span>
    </span>
  );
}

function MoreMenu({ user, items }: { user: NavUser; items: NavItem[] }) {
  const submit = useSubmit();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex min-h-11 flex-1 flex-col items-center justify-center gap-0.5 text-[0.6875rem] text-muted-foreground aria-expanded:text-foreground"
        >
          <MoreHorizontalIcon className="size-5" aria-hidden="true" />
          More
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="end" className="w-56">
        <DropdownMenuLabel className="flex items-center gap-2">
          <Avatar name={user.name} src={user.avatarUrl} />
          <span className="truncate">{user.name ?? 'Signed in'}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {items.map(({ to, label, icon: Icon }) => (
          <DropdownMenuItem key={to} asChild>
            <NavLink to={to} className={({ isActive }) => cn(isActive && 'font-medium text-brand-strong')}>
              <Icon aria-hidden="true" />
              {label}
            </NavLink>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={() => submit(null, { method: 'post', action: '/auth/logout' })}>
          <LogOutIcon aria-hidden="true" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Mobile tab bar, `md:hidden`. Five equal cells: the four `tab`-numbered
 * items in slot order, plus "More" opening a menu with everything else.
 */
function BottomTabs({ user, items }: { user: NavUser; items: NavItem[] }) {
  const tabbed = [1, 2, 3, 4]
    .map((slot) => items.find((item) => item.tab === slot))
    .filter((item): item is NavItem => item !== undefined);
  const rest = items.filter((item) => item.tab === undefined);

  return (
    <nav
      aria-label="Bottom tabs"
      className="fixed inset-x-0 bottom-0 z-40 flex border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden"
    >
      {tabbed.map((item) => (
        <NavLink key={item.to} to={item.to} className="flex flex-1">
          {({ isActive }) => (
            <TabCell isActive={isActive} label={item.label}>
              <item.icon className="size-5" aria-hidden="true" />
            </TabCell>
          )}
        </NavLink>
      ))}
      <MoreMenu user={user} items={rest} />
    </nav>
  );
}

export { BottomTabs };
