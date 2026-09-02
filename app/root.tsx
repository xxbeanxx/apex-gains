import {
  Form,
  Link,
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
} from "react-router";

import { loadUserMiddleware } from "~/auth/current-user.server";
import { userContext } from "~/auth/user-context";
import { Button } from "~/components/ui/button";

import type { Route } from "./+types/root";
import "./app.css";

export const links: Route.LinksFunction = () => [];

export const middleware: Route.MiddlewareFunction[] = [loadUserMiddleware];

export async function loader({ context }: Route.LoaderArgs) {
  const user = context.get(userContext);
  return {
    user: user
      ? { id: user.id, name: user.name, avatarUrl: user.avatarUrl }
      : null,
  };
}

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
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
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between border-b px-4 py-3">
        <Link to="/" className="font-bold tracking-tight">
          Apex Gains
        </Link>
        {user ? (
          <nav className="flex items-center gap-4 text-sm">
            <Link to="/today">Today</Link>
            <Link to="/exercises">Exercises</Link>
            <Link to="/templates">Templates</Link>
            <Link to="/routines">Routines</Link>
            <Link to="/history">History</Link>
            <Link to="/settings">Settings</Link>
            <span className="text-muted-foreground">{user.name}</span>
            <Form method="post" action="/auth/logout">
              <Button type="submit" variant="ghost" size="sm">
                Sign out
              </Button>
            </Form>
          </nav>
        ) : (
          <Button asChild variant="outline" size="sm">
            <Link to="/auth/google">Sign in with Google</Link>
          </Button>
        )}
      </header>
      <Outlet />
    </div>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let message = "Oops!";
  let details = "An unexpected error occurred.";
  let stack: string | undefined;

  if (isRouteErrorResponse(error)) {
    message = error.status === 404 ? "404" : "Error";
    details =
      error.status === 404
        ? "The requested page could not be found."
        : error.statusText || details;
  } else if (import.meta.env.DEV && error && error instanceof Error) {
    details = error.message;
    stack = error.stack;
  }

  return (
    <main className="pt-16 p-4 container mx-auto">
      <h1>{message}</h1>
      <p>{details}</p>
      {stack && (
        <pre className="w-full p-4 overflow-x-auto">
          <code>{stack}</code>
        </pre>
      )}
    </main>
  );
}
