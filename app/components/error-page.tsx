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
type ErrorDetails = {
  readonly message: string;
  readonly details: string;
  readonly stack?: string;
};

function resolveErrorDetails(error: unknown): ErrorDetails {
  if (isRouteErrorResponse(error)) {
    const is404 = error.status === 404;

    return {
      message: is404 ? 'Page not found' : 'Error',
      details: is404 ? 'The requested page could not be found.' : error.statusText || 'An unexpected error occurred.',
    };
  }

  if (import.meta.env.DEV && error instanceof Error) {
    return {
      message: 'Something went wrong',
      details: error.message,
      stack: error.stack,
    };
  }

  return {
    message: 'Something went wrong',
    details: 'An unexpected error occurred.',
  };
}

export function ErrorPage({ error }: { error: unknown }) {
  const { message, details, stack } = resolveErrorDetails(error);

  return (
    <main
      id="main"
      className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center gap-5 px-(--page-px) py-24 text-center"
    >
      <span
        aria-hidden="true"
        className="bg-destructive/10 text-destructive flex size-12 items-center justify-center rounded-full"
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
        <pre className="bg-muted text-muted-foreground mt-4 w-full overflow-x-auto rounded-xl p-4 text-left text-xs">
          <code>{stack}</code>
        </pre>
      )}
    </main>
  );
}
