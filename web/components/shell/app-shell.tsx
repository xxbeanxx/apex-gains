import type { ReactNode } from 'react';
import { BottomTabs } from '~web/components/shell/bottom-tabs';
import { type NavUser, navItemsFor } from '~web/components/shell/nav-items';
import { Sidebar } from '~web/components/shell/sidebar';
import { TopBar } from '~web/components/shell/top-bar';

/**
 * The whole authenticated chrome: a fixed sidebar on desktop, a fixed tab
 * bar on mobile, and a sticky top bar in between. Anonymous visitors get
 * the top bar alone - `home.tsx`'s own marketing layout is everything else.
 */
export function AppShell({ user, buildInfo, children }: { user: NavUser | null; buildInfo: string; children: ReactNode }) {
  const items = user ? navItemsFor(user) : [];

  return (
    <div className="flex min-h-dvh">
      <a
        href="#main"
        className="focus-visible:bg-primary focus-visible:text-primary-foreground sr-only z-50 focus-visible:not-sr-only focus-visible:fixed focus-visible:top-3 focus-visible:left-3 focus-visible:rounded-lg focus-visible:px-4 focus-visible:py-2 focus-visible:text-sm focus-visible:font-medium"
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
        <footer className="border-border text-muted-foreground hidden border-t px-(--page-px) py-3 text-center text-xs md:block">
          {buildInfo}
        </footer>
      </div>

      {user ? <BottomTabs user={user} items={items} buildInfo={buildInfo} /> : null}
    </div>
  );
}
