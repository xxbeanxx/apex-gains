import { ChevronRightIcon } from 'lucide-react';
import { Link, useMatches } from 'react-router';

import { isCrumbHandle, type Crumb } from '~/lib/breadcrumbs';

import { NAV_ITEMS } from './nav-items';

/**
 * Flattens every matched route's `crumb`, in match order (root to leaf).
 * A route with no handle at all - true of every route so far - falls back
 * to the nav item whose path prefixes the current one, so nothing renders
 * unlabelled while handles are still being filled in.
 */
function useBreadcrumbs(): Crumb[] {
  const matches = useMatches();

  const crumbs = matches.flatMap((match) => {
    if (!isCrumbHandle(match.handle)) return [];
    const result = match.handle.crumb(match.loaderData);
    return Array.isArray(result) ? result : [result];
  });
  if (crumbs.length > 0) return crumbs;

  const pathname = matches.at(-1)?.pathname ?? '';
  const fallback = NAV_ITEMS.find((item) => pathname === item.to || pathname.startsWith(`${item.to}/`));
  return fallback ? [{ label: fallback.label }] : [];
}

function Breadcrumbs() {
  const crumbs = useBreadcrumbs();
  if (crumbs.length === 0) return null;

  return (
    <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 text-sm">
      {crumbs.map((crumb, index) => {
        const isLast = index === crumbs.length - 1;
        return (
          <span key={index} className="flex min-w-0 items-center gap-1.5">
            {index > 0 ? <ChevronRightIcon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" /> : null}
            {crumb.to && !isLast ? (
              <Link to={crumb.to} className="truncate text-muted-foreground hover:text-foreground">
                {crumb.label}
              </Link>
            ) : (
              <span aria-current={isLast ? 'page' : undefined} className="truncate font-medium text-foreground">
                {crumb.label}
              </span>
            )}
          </span>
        );
      })}
    </nav>
  );
}

export { Breadcrumbs };
