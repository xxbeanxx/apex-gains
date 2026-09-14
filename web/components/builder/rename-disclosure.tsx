import { PencilIcon } from 'lucide-react';
import { type ReactNode, useRef } from 'react';
import { useCloseOnSubmit } from '~web/components/builder/use-close-on-submit';
import { buttonVariants } from '~web/components/ui/button';
import { cn } from '~web/lib/utils';

/**
 * The header's "Rename" action: a `<details>` popover rather than a dialog,
 * so it needs no open/close state of its own - the native element already
 * closes on an outside click. It closes itself once the form it wraps
 * submits, since the native element otherwise stays open across the
 * client-side transition that follows.
 */
export function RenameDisclosure({ label = 'Rename', children }: { label?: string; children: ReactNode }) {
  const detailsRef = useRef<HTMLDetailsElement>(null);
  useCloseOnSubmit(() => {
    if (detailsRef.current) {
      detailsRef.current.open = false;
    }
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
      <div className="border-border bg-popover ring-foreground/10 absolute right-0 z-20 mt-2 w-72 rounded-xl border p-3 shadow-lg ring-1">
        {children}
      </div>
    </details>
  );
}
