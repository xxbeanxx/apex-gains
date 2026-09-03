import { AlertTriangleIcon, HomeIcon } from "lucide-react";
import {
  Link,
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
} from "react-router";

import { AppNav } from "~/components/app-nav";
import { NavProgress } from "~/components/nav-progress";
import { themeInitScript } from "~/components/theme-toggle";
import { loadUserMiddleware } from "~/auth/current-user.server";
import { userContext } from "~/auth/user-context";
import { Button } from "~/components/ui/button";
import { getBuildInfo } from "~/lib/build-info.server";
import { requestLoggingMiddleware } from "~/lib/logger.server";

import type { Route } from "./+types/root";
import "./app.css";

export const links: Route.LinksFunction = () => [];

export const middleware: Route.MiddlewareFunction[] = [
  requestLoggingMiddleware,
  loadUserMiddleware,
];

export async function loader({ context }: Route.LoaderArgs) {
  const user = context.get(userContext);
  return {
    user: user
      ? { id: user.id, name: user.name, avatarUrl: user.avatarUrl }
      : null,
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
        {loaderData?.buildInfo ?? "unknown"}
      </footer>
    </div>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let message = "Something went wrong";
  let details = "An unexpected error occurred.";
  let stack: string | undefined;

  if (isRouteErrorResponse(error)) {
    message = error.status === 404 ? "Page not found" : "Error";
    details =
      error.status === 404
        ? "The requested page could not be found."
        : error.statusText || details;
  } else if (import.meta.env.DEV && error && error instanceof Error) {
    details = error.message;
    stack = error.stack;
  }

  return (
    <main
      id="main"
      className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center gap-5 px-(--page-px) py-24 text-center"
    >
      <span
        aria-hidden="true"
        className="flex size-12 items-center justify-center rounded-full bg-destructive/10 text-destructive"
      >
        <AlertTriangleIcon className="size-6" />
      </span>
      <div className="flex flex-col gap-2">
        <h1 className="font-heading text-3xl font-semibold tracking-tight">
          {message}
        </h1>
        <p className="text-muted-foreground">{details}</p>
      </div>
      <Button asChild variant="outline">
        <Link to="/">
          <HomeIcon aria-hidden="true" />
          Back home
        </Link>
      </Button>
      {stack && (
        <pre className="mt-4 w-full overflow-x-auto rounded-xl bg-muted p-4 text-left text-xs text-muted-foreground">
          <code>{stack}</code>
        </pre>
      )}
    </main>
  );
}
