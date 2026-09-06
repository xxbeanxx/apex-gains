import { PencilIcon } from 'lucide-react';
import * as React from 'react';

import { buttonVariants } from '~/components/ui/button';
import { useCloseOnSubmit } from '~/components/builder/use-close-on-submit';
import { cn } from '~/lib/utils';

/**
 * The header's "Rename" action: a `<details>` popover rather than a dialog,
 * so it needs no open/close state of its own - the native element already
 * closes on an outside click. It closes itself once the form it wraps
 * submits, since the native element otherwise stays open across the
 * client-side transition that follows.
 */
function RenameDisclosure({ label = 'Rename', children }: { label?: string; children: React.ReactNode }) {
  const detailsRef = React.useRef<HTMLDetailsElement>(null);
  useCloseOnSubmit(() => {
    if (detailsRef.current) detailsRef.current.open = false;
  });

  return (
    <details ref={detailsRef} className="relative">
      <summary
        role="button"
        className={cn(
          buttonVariants({ variant: 'outline', size: 'sm' }),
          'cursor-pointer list-none [&::-webkit-details-marker]:hidden',
        )}
      >
        <PencilIcon aria-hidden="true" />
        {label}
      </summary>
      <div className="absolute right-0 z-20 mt-2 w-72 rounded-xl border border-border bg-popover p-3 shadow-lg ring-1 ring-foreground/10">
        {children}
      </div>
    </details>
  );
}

export { RenameDisclosure };
