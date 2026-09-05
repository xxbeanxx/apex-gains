import { DumbbellIcon, LogOutIcon } from 'lucide-react';
import { Link, useSubmit } from 'react-router';

import { Breadcrumbs } from '~/components/shell/breadcrumbs';
import { CommandPalette } from '~/components/shell/command-palette';
import { ThemeToggle } from '~/components/theme-toggle';
import { Avatar } from '~/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '~/components/ui/dropdown-menu';

import type { NavUser } from './nav-items';

function AccountMenu({ user }: { user: NavUser }) {
  const submit = useSubmit();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" aria-label="Account menu" className="flex items-center rounded-full">
          <Avatar name={user.name} src={user.avatarUrl} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel className="truncate">{user.name ?? 'Signed in'}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/settings">Settings</Link>
        </DropdownMenuItem>
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
 * Sticky chrome above every page. `user` is null on the marketing splash,
 * which has no sidebar to carry the brand lockup, so this is the one place
 * it shows instead.
 */
function TopBar({ user }: { user: NavUser | null }) {
  return (
    <header className="sticky top-0 z-30 flex h-(--header-h) items-center gap-2 border-b border-border bg-background/80 px-(--page-px) backdrop-blur-md supports-backdrop-filter:bg-background/65">
      {user ? (
        <div className="min-w-0 flex-1">
          <Breadcrumbs />
        </div>
      ) : (
        <Link to="/" className="mr-auto flex items-center gap-2 font-heading text-base font-semibold tracking-tight">
          <span
            aria-hidden="true"
            className="flex size-7 items-center justify-center rounded-lg bg-brand text-brand-foreground"
          >
            <DumbbellIcon className="size-4" />
          </span>
          Apex Gains
        </Link>
      )}
      <div className="flex items-center gap-2">
        {user ? <CommandPalette user={user} /> : null}
        <ThemeToggle />
        {user ? (
          <AccountMenu user={user} />
        ) : (
          <Link to="/auth/google" className="text-sm font-medium text-muted-foreground hover:text-foreground">
            Sign in
          </Link>
        )}
      </div>
    </header>
  );
}

export { TopBar };
