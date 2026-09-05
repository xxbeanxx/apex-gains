import * as React from 'react';

import { cn } from '~/lib/utils';

/**
 * Page rhythm lives here and nowhere else.
 *
 * Every route previously hand-rolled `mx-auto max-w-7xl px-4 py-8`, with the
 * width drifting between 7xl / 6xl / 2xl / lg from page to page. One container,
 * one gutter token (`--page-px`), one vertical rhythm token (`--section-gap`).
 */

type Width = 'full' | 'default' | 'narrow' | 'prose';

const widths: Record<Width, string> = {
  full: 'max-w-none',
  default: 'max-w-(--content-max)',
  narrow: 'max-w-4xl',
  prose: 'max-w-2xl',
};

function Page({ className, width = 'default', ...props }: React.ComponentProps<'main'> & { width?: Width }) {
  return (
    <main
      id="main"
      tabIndex={-1}
      className={cn(
        'mx-auto w-full flex-1 px-(--page-px) pt-8 pb-16 outline-none',
        'animate-rise-in',
        widths[width],
        className,
      )}
      {...props}
    />
  );
}

/**
 * Page title block. `actions` sits inline on wide screens and wraps beneath the
 * title on narrow ones rather than crushing the heading.
 */
function PageHeader({
  title,
  description,
  actions,
  badge,
  className,
  ...props
}: Omit<React.ComponentProps<'header'>, 'title'> & {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  badge?: React.ReactNode;
}) {
  return (
    <header className={cn('flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between', className)} {...props}>
      <div className="flex min-w-0 flex-col gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-heading text-3xl font-semibold tracking-tight">{title}</h1>
          {badge}
        </div>
        {description ? <p className="max-w-prose text-sm text-pretty text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

/** A titled band of content, separated by the shared section rhythm. */
function Section({
  title,
  description,
  actions,
  headingLevel = 'h2',
  className,
  children,
  ...props
}: Omit<React.ComponentProps<'section'>, 'title'> & {
  title?: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  headingLevel?: 'h2' | 'h3';
}) {
  const Heading = headingLevel;

  return (
    <section className={cn('mt-(--section-gap) flex flex-col gap-4', className)} {...props}>
      {title ? (
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-col gap-1">
            <Heading className="font-heading text-lg font-semibold tracking-tight">{title}</Heading>
            {description ? <p className="max-w-prose text-sm text-muted-foreground">{description}</p> : null}
          </div>
          {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export { Page, PageHeader, Section };
