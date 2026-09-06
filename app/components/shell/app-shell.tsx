import { BottomTabs } from '~/components/shell/bottom-tabs';
import { navItemsFor, type NavUser } from '~/components/shell/nav-items';
import { Sidebar } from '~/components/shell/sidebar';
import { TopBar } from '~/components/shell/top-bar';

/**
 * The whole authenticated chrome: a fixed sidebar on desktop, a fixed tab
 * bar on mobile, and a sticky top bar in between. Anonymous visitors get
 * the top bar alone - `home.tsx`'s own marketing layout is everything else.
 */
function AppShell({ user, buildInfo, children }: { user: NavUser | null; buildInfo: string; children: React.ReactNode }) {
  const items = user ? navItemsFor(user) : [];

  return (
    <div className="flex min-h-dvh">
      <a
        href="#main"
        className="sr-only z-50 focus-visible:not-sr-only focus-visible:fixed focus-visible:top-3 focus-visible:left-3 focus-visible:rounded-lg focus-visible:bg-primary focus-visible:px-4 focus-visible:py-2 focus-visible:text-sm focus-visible:font-medium focus-visible:text-primary-foreground"
      >
        Skip to content
      </a>

      {user ? <Sidebar items={items} /> : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar user={user} />
        <div
          className={
            user
              ? 'flex flex-1 flex-col pb-[calc(var(--bottom-tabs-h)+env(safe-area-inset-bottom))] md:pb-0'
              : 'flex flex-1 flex-col'
          }
        >
          {children}
        </div>
        <footer className="hidden border-t border-border px-(--page-px) py-3 text-center text-xs text-muted-foreground md:block">
          {buildInfo}
        </footer>
      </div>

      {user ? <BottomTabs user={user} items={items} buildInfo={buildInfo} /> : null}
    </div>
  );
}

export { AppShell };
