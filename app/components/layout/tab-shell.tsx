import type { ReactNode } from 'react';
import type * as React from 'react';

import { Link } from 'react-router';

import { cn } from '~/lib/utils';

export type TabSection = {
  id: string;
  label: string;
  content: ReactNode;
};

/**
 * A left sub-nav of section names beside the active one's content, collapsing
 * to a horizontal scrolling strip below `md:`. Each entry is a real link to
 * `?section=<id>` rather than a client-toggled panel - the active section
 * survives a form submit's own page reload for free, and the whole switcher
 * still works with JavaScript disabled.
 */
function TabShell({
  sections,
  activeId,
  hrefFor,
  ariaLabel,
}: {
  sections: TabSection[];
  activeId: string;
  hrefFor: (id: string) => string;
  ariaLabel: string;
}) {
  const active = sections.find((section) => section.id === activeId) ?? sections[0];

  return (
    <div className="flex flex-col gap-(--section-gap) md:flex-row md:items-start">
      <nav aria-label={ariaLabel} className="scrollbar-none flex gap-1 overflow-x-auto md:w-44 md:shrink-0 md:flex-col">
        {sections.map((section) => (
          <Link
            key={section.id}
            to={hrefFor(section.id)}
            aria-current={section.id === active.id ? 'page' : undefined}
            className={cn(
              'shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors duration-(--dur-fast)',
              section.id === active.id
                ? 'bg-muted text-foreground'
                : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
            )}
          >
            {section.label}
          </Link>
        ))}
      </nav>
      <div className="min-w-0 flex-1">{active.content}</div>
    </div>
  );
}

export { TabShell };
