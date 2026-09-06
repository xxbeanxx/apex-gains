import type { ReactNode } from 'react';
import * as React from 'react';

import type { LucideIcon } from 'lucide-react';

import { cn } from '~/lib/utils';

/**
 * The "nothing here yet" state. Replaces bare grey sentences with something
 * that reads as a deliberate destination and offers the next action.
 */
function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
  compact = false,
}: {
  icon?: LucideIcon;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
  compact?: boolean;
}) {
  return (
    <div
      data-slot="empty-state"
      className={cn(
        'flex flex-col items-center justify-center rounded-xl border border-dashed border-border text-center',
        compact ? 'gap-2 px-4 py-6' : 'gap-3 px-6 py-12',
        className,
      )}
    >
      {Icon ? (
        <span
          className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground"
          aria-hidden="true"
        >
          <Icon className="size-5" />
        </span>
      ) : null}
      <p className="font-heading text-base font-medium text-foreground">{title}</p>
      {description ? <p className="max-w-prose text-sm text-muted-foreground">{description}</p> : null}
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}

export { EmptyState };
