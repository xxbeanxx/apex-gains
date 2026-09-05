/**
 * A route names its place in the breadcrumb trail by exporting `handle`.
 * `top-bar.tsx` reads it off `useMatches()`, so a route that renders under
 * more than one path (a resource route fetched by `fetcher.load`, a
 * loader-only redirect) simply has none - only a route that is itself ever
 * the current page needs one.
 */
export type Crumb = { label: string; to?: string };
export type CrumbHandle = { crumb: (data: unknown) => Crumb | Crumb[] };

export function isCrumbHandle(handle: unknown): handle is CrumbHandle {
  return (
    typeof handle === 'object' &&
    handle !== null &&
    'crumb' in handle &&
    typeof (handle as { crumb: unknown }).crumb === 'function'
  );
}
