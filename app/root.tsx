import { Links, Meta, Outlet, Scripts, ScrollRestoration } from 'react-router';

import { AppNav } from '~/components/app-nav';
import { ErrorPage } from '~/components/error-page';
import { NavProgress } from '~/components/nav-progress';
import { themeInitScript } from '~/components/theme-toggle';
import { loadUserMiddleware } from '~/auth/current-user.server';
import { userContext } from '~/auth/user-context';
import { getBuildInfo } from '~/lib/build-info.server';
import { requestLoggingMiddleware } from '~/lib/logger.server';

import type { Route } from './+types/root';
import './app.css';

export const links: Route.LinksFunction = () => [];

// requestLoggingMiddleware must run first: it is what times the request, so
// anything it wraps (loadUserMiddleware included) counts towards the duration
// it logs.
export const middleware: Route.MiddlewareFunction[] = [requestLoggingMiddleware, loadUserMiddleware];

export async function loader({ context }: Route.LoaderArgs) {
  const user = context.get(userContext);
  return {
    user: user ? { id: user.id, name: user.name, avatarUrl: user.avatarUrl } : null,
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
        {/* Must stay blocking and ahead of styles - it prevents the
            light-mode flash on a dark-mode load. */}
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
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
    <div className="flex min-h-dvh flex-col">
      <NavProgress />
      <AppNav user={user} />
      <Outlet />
      <footer className="border-t border-border px-(--page-px) py-3 text-center text-xs text-muted-foreground">
        {loaderData?.buildInfo ?? 'unknown'}
      </footer>
    </div>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  return <ErrorPage error={error} />;
}
