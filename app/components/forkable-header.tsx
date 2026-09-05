import { RotateCcwIcon, Trash2Icon } from 'lucide-react';

import { Badge } from '~/components/ui/badge';
import { SubmitButton } from '~/components/ui/submit-button';
import type { Intent } from '~/lib/intent';

/**
 * The header chrome a fork-on-write detail page carries: what the row's
 * ownership is, and the one action that follows from it.
 *
 * `Ownership` in the domain decides what a sample is; these two say what
 * that looks like, once, so a plan and a workout can't drift into
 * describing the same state differently.
 */

type Ownership = {
  /** Shared library data, read-only until the athlete edits it. */
  readonly isSample: boolean;
  /** Their own copy of a sample - shown as "Customized" rather than "Sample". */
  readonly isCustomized: boolean;
};

export function OwnershipBadge({ isSample, isCustomized }: Ownership) {
  if (isSample) return <Badge variant="outline">Sample</Badge>;
  if (isCustomized) return <Badge variant="secondary">Customized</Badge>;
  return null;
}

/**
 * A sample offers neither: it belongs to everyone, so there is nothing to
 * revert and nothing this athlete may delete. A personal copy of one reverts
 * back to the sample; anything else deletes outright.
 */
export function RevertOrDeleteForm({
  noun,
  isSample,
  isCustomized,
  revert,
  remove,
  actionData,
}: Ownership & {
  /** Lower-case, as a button says it: "Delete plan". */
  noun: string;
  revert: Intent<void>;
  remove: Intent<void>;
  actionData: unknown;
}) {
  if (isSample) return null;

  const intent = isCustomized ? revert : remove;
  const error = intent.errorIn(actionData);

  return (
    <form method="post" className="flex flex-col items-end gap-1.5">
      <input {...intent.field} />
      {isCustomized ? (
        <SubmitButton variant="outline" size="sm" match={intent.match} pendingLabel="Reverting">
          <RotateCcwIcon aria-hidden="true" />
          Revert to sample
        </SubmitButton>
      ) : (
        <SubmitButton variant="destructive" size="sm" match={intent.match} pendingLabel={`Deleting ${noun}`}>
          <Trash2Icon aria-hidden="true" />
          Delete {noun}
        </SubmitButton>
      )}
      {error ? <p className="text-sm font-medium text-destructive">{error}</p> : null}
    </form>
  );
}
