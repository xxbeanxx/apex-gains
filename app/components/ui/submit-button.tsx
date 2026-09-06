import { Loader2Icon } from 'lucide-react';
import * as React from 'react';
import { useNavigation } from 'react-router';

import { Button } from '~/components/ui/button';
import { cn } from '~/lib/utils';

type SubmitButtonProps = React.ComponentProps<typeof Button> & {
  /**
   * Explicit pending flag. Use for `useFetcher` forms:
   * `pending={fetcher.state !== "idle"}`.
   */
  pending?: boolean;
  /**
   * For a `<Form method="post">`, the hidden fields identifying *this*
   * form, e.g. `{ intent: "rename" }`. Without it a page with several forms
   * would spin every button on any submission.
   */
  match?: Record<string, string>;
  /** Announced to screen readers while pending. */
  pendingLabel?: string;
};

/**
 * A submit button that shows it is working. Purely presentational - the form
 * still submits exactly as it did before.
 */
function SubmitButton({
  pending: pendingProp,
  match,
  pendingLabel = 'Working…',
  children,
  className,
  disabled,
  ...props
}: SubmitButtonProps) {
  const navigation = useNavigation();

  const matchesNavigation =
    navigation.state === 'submitting' &&
    navigation.formData != null &&
    (match === undefined || Object.entries(match).every(([key, value]) => navigation.formData?.get(key) === value));

  const pending = pendingProp ?? matchesNavigation;

  return (
    <Button
      aria-busy={pending || undefined}
      disabled={disabled || pending}
      className={cn('relative', className)}
      {...props}
      // Last, so it can't be clobbered by a merged-in `type` - notably
      // Radix's `AlertDialogAction`/`DialogClose`, which forces `type:
      // "button"` onto whatever it wraps via `asChild` so it never
      // double-submits as a plain dialog button; wrapping a `SubmitButton`
      // in one to gate a real submission behind a confirm step depends on
      // this staying "submit" regardless.
      type="submit"
    >
      {pending ? <Loader2Icon className="animate-spin" aria-hidden="true" /> : null}
      {children}
      <span className="sr-only" aria-live="polite">
        {pending ? pendingLabel : ''}
      </span>
    </Button>
  );
}

export { SubmitButton };
