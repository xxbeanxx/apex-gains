import { Links, Meta, Outlet, Scripts, ScrollRestoration } from 'react-router';

import { ErrorPage } from '~/components/error-page';
import { NavProgress } from '~/components/nav-progress';
import { AppShell } from '~/components/shell/app-shell';
import { sidebarInitScript } from '~/components/shell/shell-init';
import { themeInitScript } from '~/components/theme-toggle';
import { loadUserMiddleware } from '~/auth/current-user.server';
import { userContext } from '~/auth/user-context';
import { getBuildInfo } from '~/lib/build-info.server';
import { requestLoggingMiddleware } from '~/lib/logger.server';

import type { Route } from './+types/root';
import './app.css';

export const links: Route.LinksFunction = () => [
  { rel: 'manifest', href: '/manifest.webmanifest' },
  { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' },
];

// requestLoggingMiddleware must run first: it is what times the request, so
// anything it wraps (loadUserMiddleware included) counts towards the duration
// it logs.
export const middleware: Route.MiddlewareFunction[] = [requestLoggingMiddleware, loadUserMiddleware];

export async function loader({ context }: Route.LoaderArgs) {
  const user = context.get(userContext);
  return {
    user: user ? { id: user.id, name: user.name, avatarUrl: user.avatarUrl, isAdmin: user.isAdmin } : null,
    buildInfo: getBuildInfo(),
  };
}

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    // suppressHydrationWarning: themeInitScript sets `class` and
    // `style.color-scheme` on <html> before React hydrates.
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        {
          // Not the `meta` route export - a child route's `meta` replaces
          // the parent's rather than merging, so anything put there would
          // vanish on every page. These stay literal elements here instead.
        }
        <meta name="theme-color" content="#fbfaf7" media="(prefers-color-scheme: light)" />
        <meta name="theme-color" content="#0d0c08" media="(prefers-color-scheme: dark)" />
        {
          // Must stay blocking and ahead of styles - it prevents the
          // light-mode flash on a dark-mode load.
        }
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        {
          // Same reasoning as the theme script: read before first paint so
          // a collapsed sidebar does not flash open, ahead of hydration.
        }
        <script dangerouslySetInnerHTML={{ __html: sidebarInitScript }} />
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App({ loaderData }: Route.ComponentProps) {
  const user = loaderData?.user ?? null;

  return (
    <>
      <NavProgress />
      <AppShell user={user} buildInfo={loaderData?.buildInfo ?? 'unknown'}>
        <Outlet />
      </AppShell>
    </>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  return <ErrorPage error={error} />;
}
