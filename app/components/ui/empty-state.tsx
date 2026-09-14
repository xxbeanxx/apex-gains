import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

import { cn } from '~/lib/utils';

/**
 * The "nothing here yet" state. Replaces bare grey sentences with something
 * that reads as a deliberate destination and offers the next action.
 */
export function EmptyState({
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
          className="bg-muted text-muted-foreground flex size-10 items-center justify-center rounded-full"
          aria-hidden="true"
        >
          <Icon className="size-5" />
        </span>
      ) : null}
      <p className="font-heading text-foreground text-base font-medium">{title}</p>
      {description ? <p className="text-muted-foreground max-w-prose text-sm">{description}</p> : null}
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}
