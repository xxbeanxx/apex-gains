import type * as React from 'react';

/**
 * The three-pane grid a plan or workout builder sits in: palette, canvas,
 * outline. `palette` is hidden below `md:` (the page's own "Add ..." button
 * and dialog carry the same content there) and `outline` is hidden below
 * `lg:`, where the canvas row's own up/down controls are already enough to
 * reorder.
 */
function BuilderLayout({
  palette,
  canvas,
  outline,
}: {
  palette: React.ReactNode;
  canvas: React.ReactNode;
  outline?: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-[16rem_minmax(0,1fr)] lg:grid-cols-[16rem_minmax(0,1fr)_14rem]">
      <div className="hidden md:sticky md:top-(--header-h) md:block">{palette}</div>
      <div className="min-w-0">{canvas}</div>
      {outline ? <div className="hidden lg:sticky lg:top-(--header-h) lg:block">{outline}</div> : null}
    </div>
  );
}

export { BuilderLayout };
