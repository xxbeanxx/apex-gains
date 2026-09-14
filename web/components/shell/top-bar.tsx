import { DumbbellIcon, LogOutIcon } from 'lucide-react';
import { Link, useSubmit } from 'react-router';
import { Breadcrumbs } from '~web/components/shell/breadcrumbs';
import { CommandPalette } from '~web/components/shell/command-palette';
import type { NavUser } from '~web/components/shell/nav-items';
import { ThemeToggle } from '~web/components/theme-toggle';
import { Avatar } from '~web/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '~web/components/ui/dropdown-menu';

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
export function TopBar({ user }: { user: NavUser | null }) {
  return (
    <header className="border-border bg-background/80 supports-backdrop-filter:bg-background/65 sticky top-0 z-30 flex h-(--header-h) items-center gap-2 border-b px-(--page-px) backdrop-blur-md">
      {user ? (
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <Link to="/" aria-label="Home" className="flex shrink-0 items-center rounded-lg md:hidden">
            <span
              aria-hidden="true"
              className="bg-brand text-brand-foreground flex size-7 items-center justify-center rounded-lg"
            >
              <DumbbellIcon className="size-4" />
            </span>
          </Link>
          <Breadcrumbs />
        </div>
      ) : (
        <Link to="/" className="font-heading mr-auto flex items-center gap-2 text-base font-semibold tracking-tight">
          <span
            aria-hidden="true"
            className="bg-brand text-brand-foreground flex size-7 items-center justify-center rounded-lg"
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
          <Link to="/auth/google" className="text-muted-foreground hover:text-foreground text-sm font-medium">
            Sign in
          </Link>
        )}
      </div>
    </header>
  );
}
