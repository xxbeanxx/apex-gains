import { AlertTriangleIcon, HomeIcon } from 'lucide-react';
import { Link, isRouteErrorResponse } from 'react-router';

import { Button } from '~/components/ui/button';

// Shared by root.tsx's ErrorBoundary and by any loader/action-only route
// (auth.*.tsx) that has neither a `default` nor an `ErrorBoundary` export -
// React Router treats such routes as raw resource routes and returns thrown
// errors as unstyled plain-text responses instead of rendering a boundary.
// Exporting this as that route's ErrorBoundary opts it back into normal
// document rendering (still wrapped in root's <Layout>) without giving it a
// `default` component it doesn't otherwise need.
export function ErrorPage({ error }: { error: unknown }) {
  let message = 'Something went wrong';
  let details = 'An unexpected error occurred.';
  let stack: string | undefined;

  if (isRouteErrorResponse(error)) {
    message = error.status === 404 ? 'Page not found' : 'Error';
    details = error.status === 404 ? 'The requested page could not be found.' : error.statusText || details;
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
        <h1 className="font-heading text-3xl font-semibold tracking-tight">{message}</h1>
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
