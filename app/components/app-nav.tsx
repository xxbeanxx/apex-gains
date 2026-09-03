import {
  CalendarCheckIcon,
  DumbbellIcon,
  HistoryIcon,
  type LucideIcon,
  MenuIcon,
  RepeatIcon,
  ScaleIcon,
  SettingsIcon,
  ClipboardListIcon,
  LogOutIcon,
} from "lucide-react"
import { Form, Link, NavLink, useSubmit } from "react-router"

import { ThemeToggle } from "~/components/theme-toggle"
import { Button } from "~/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu"
import { cn } from "~/lib/utils"

type NavItem = { to: string; label: string; icon: LucideIcon }

const NAV_ITEMS: NavItem[] = [
  { to: "/today", label: "Today", icon: CalendarCheckIcon },
  { to: "/exercises", label: "Exercises", icon: DumbbellIcon },
  { to: "/templates", label: "Templates", icon: ClipboardListIcon },
  { to: "/routines", label: "Routines", icon: RepeatIcon },
  { to: "/history", label: "History", icon: HistoryIcon },
  { to: "/weight", label: "Weight", icon: ScaleIcon },
  { to: "/settings", label: "Settings", icon: SettingsIcon },
]

type NavUser = { id: string; name: string | null; avatarUrl: string | null }

/** First letter of the display name, for the avatar fallback. */
function initial(name: string | null) {
  return name?.trim()?.charAt(0)?.toUpperCase() || "?"
}

function UserAvatar({ user }: { user: NavUser }) {
  return user.avatarUrl ? (
    <img
      src={user.avatarUrl}
      alt=""
      width={28}
      height={28}
      className="size-7 rounded-full object-cover ring-1 ring-border"
    />
  ) : (
    <span
      aria-hidden="true"
      className="flex size-7 items-center justify-center rounded-full bg-brand-muted text-xs font-semibold text-brand-strong ring-1 ring-brand/25"
    >
      {initial(user.name)}
    </span>
  )
}

function DesktopNav() {
  return (
    <nav aria-label="Main" className="hidden md:block">
      <ul className="flex items-center gap-1">
        {NAV_ITEMS.map(({ to, label }) => (
          <li key={to}>
            <NavLink
              to={to}
              className={({ isActive }) =>
                cn(
                  "relative flex h-(--header-h) items-center px-3 text-sm font-medium transition-colors duration-(--dur-fast)",
                  isActive
                    ? "text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )
              }
            >
              {({ isActive }) => (
                <>
                  {label}
                  {/* Volt underline is the only brand-coloured chrome here.
                      `brand-strong`, not `brand`: a 2px indicator must clear
                      3:1 against the header, which the light fill does not. */}
                  <span
                    aria-hidden="true"
                    className={cn(
                      "absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-brand-strong transition-[opacity,transform] duration-(--dur) ease-(--ease-quint)",
                      isActive ? "scale-x-100 opacity-100" : "scale-x-0 opacity-0"
                    )}
                  />
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}

function MobileNav({ user }: { user: NavUser }) {
  const submit = useSubmit()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="icon-sm"
          className="md:hidden"
          aria-label="Open menu"
        >
          <MenuIcon />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="flex items-center gap-2">
          <UserAvatar user={user} />
          <span className="truncate">{user.name ?? "Signed in"}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
          <DropdownMenuItem key={to} asChild>
            <NavLink
              to={to}
              className={({ isActive }) =>
                cn(isActive && "font-medium text-brand-strong")
              }
            >
              <Icon aria-hidden="true" />
              {label}
            </NavLink>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          onSelect={() =>
            submit(null, { method: "post", action: "/auth/logout" })
          }
        >
          <LogOutIcon aria-hidden="true" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function AppNav({ user }: { user: NavUser | null }) {
  return (
    <>
      <a
        href="#main"
        className="sr-only z-50 focus-visible:not-sr-only focus-visible:fixed focus-visible:top-3 focus-visible:left-3 focus-visible:rounded-lg focus-visible:bg-primary focus-visible:px-4 focus-visible:py-2 focus-visible:text-sm focus-visible:font-medium focus-visible:text-primary-foreground"
      >
        Skip to content
      </a>

      <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur-md supports-backdrop-filter:bg-background/65">
        <div className="mx-auto flex h-(--header-h) max-w-(--content-max) items-center gap-2 px-(--page-px)">
          <Link
            to="/"
            className="mr-1 flex items-center gap-2 font-heading text-base font-semibold tracking-tight"
          >
            <span
              aria-hidden="true"
              className="flex size-7 items-center justify-center rounded-lg bg-brand text-brand-foreground"
            >
              <DumbbellIcon className="size-4" />
            </span>
            Apex Gains
          </Link>

          {user ? <DesktopNav /> : null}

          <div className="ml-auto flex items-center gap-2">
            <ThemeToggle />
            {user ? (
              <>
                <div className="hidden items-center gap-2 md:flex">
                  <span className="flex items-center gap-2 text-sm text-muted-foreground">
                    <UserAvatar user={user} />
                    <span className="max-w-32 truncate">{user.name}</span>
                  </span>
                  <Form method="post" action="/auth/logout">
                    <Button type="submit" variant="ghost" size="sm">
                      Sign out
                    </Button>
                  </Form>
                </div>
                <MobileNav user={user} />
              </>
            ) : (
              <Button asChild variant="outline" size="sm">
                <Link to="/auth/google">Sign in</Link>
              </Button>
            )}
          </div>
        </div>
      </header>
    </>
  )
}

export { AppNav }
