import { type ReactNode, useId } from 'react';

import { Form } from 'react-router';

import { CopyIcon, RotateCcwIcon, Trash2Icon } from 'lucide-react';

import { RenameDisclosure } from '~/components/builder/rename-disclosure';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { ConfirmDialog } from '~/components/ui/confirm-dialog';
import { Field } from '~/components/ui/field';
import { Input } from '~/components/ui/input';
import { SubmitButton } from '~/components/ui/submit-button';
import type { ForkableDetail } from '~/lib/forkable-detail';
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
  /**
   * Shared library data, read-only until the athlete edits it.
   */
  readonly isSample: boolean;
  /**
   * Their own copy of a sample - shown as "Customized" rather than "Sample".
   */
  readonly isCustomized: boolean;
};

export function OwnershipBadge({ isSample, isCustomized }: Ownership) {
  if (isSample) {
    return <Badge variant="outline">Sample</Badge>;
  }

  if (isCustomized) {
    return <Badge variant="secondary">Customized</Badge>;
  }
}

/**
 * The header's actions, for `page.intents`: rename, then whatever the page
 * alone offers (`children`), then duplicate, then revert-or-delete.
 */
export function ForkableActions({
  page,
  name,
  isSample,
  isCustomized,
  actionData,
  children,
}: Ownership & {
  page: ForkableDetail;
  /**
   * The row's current name, which the rename field starts from.
   */
  name: string;
  actionData: unknown;
  children?: ReactNode;
}) {
  const { intents } = page;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <RenameDisclosure>
        <Form method="post">
          <input {...intents.rename.field} />
          <Field
            label="Name"
            error={intents.rename.errorIn(actionData)}
            action={
              <SubmitButton size="sm" match={intents.rename.match} pendingLabel="Saving">
                Save
              </SubmitButton>
            }
          >
            <Input key={name} name="name" defaultValue={name} required />
          </Field>
        </Form>
      </RenameDisclosure>
      {children}
      <Form method="post">
        <input {...intents.duplicate.field} />
        <SubmitButton variant="outline" size="sm" match={intents.duplicate.match} pendingLabel="Duplicating">
          <CopyIcon aria-hidden="true" />
          Duplicate
        </SubmitButton>
      </Form>
      <RevertOrDeleteForm
        noun={page.noun.toLowerCase()}
        isSample={isSample}
        isCustomized={isCustomized}
        revert={intents.revert}
        remove={intents.delete}
        actionData={actionData}
      />
    </div>
  );
}

/**
 * The line under the header of a customized copy, and nothing otherwise.
 */
export function CustomizedNote({ page, isCustomized }: { page: ForkableDetail; isCustomized: boolean }) {
  if (!isCustomized) return null;

  const noun = page.noun.toLowerCase();
  return (
    <p className="mt-4 text-sm text-muted-foreground">
      This is your customized copy of a sample {noun}. The original sample is unaffected.
    </p>
  );
}

/**
 * A sample offers neither: it belongs to everyone, so there is nothing to
 * revert and nothing this athlete may delete. A personal copy of one reverts
 * back to the sample; anything else deletes outright.
 */
function RevertOrDeleteForm({
  noun,
  isSample,
  isCustomized,
  revert,
  remove,
  actionData,
}: Ownership & {
  /**
   * Lower-case, as a button says it: "Delete plan".
   */
  noun: string;
  revert: Intent<void>;
  remove: Intent<void>;
  actionData: unknown;
}) {
  const formId = useId();

  if (isSample) {
    return;
  }

  const intent = isCustomized ? revert : remove;
  const error = intent.errorIn(actionData);

  return (
    <div className="flex flex-col items-end gap-1.5">
      <Form method="post" id={formId} className="contents">
        <input {...intent.field} />
      </Form>
      {isCustomized ? (
        <ConfirmDialog
          trigger={
            <Button variant="outline" size="sm">
              <RotateCcwIcon aria-hidden="true" />
              Revert to sample
            </Button>
          }
          title={`Revert to sample ${noun}?`}
          description={`Your changes to this ${noun} will be discarded and it will go back to matching the shared sample. This can't be undone.`}
          confirmButton={
            <SubmitButton form={formId} variant="outline" size="sm" match={intent.match} pendingLabel="Reverting">
              <RotateCcwIcon aria-hidden="true" />
              Revert to sample
            </SubmitButton>
          }
        />
      ) : (
        <ConfirmDialog
          trigger={
            <Button variant="destructive" size="sm">
              <Trash2Icon aria-hidden="true" />
              Delete {noun}
            </Button>
          }
          title={`Delete this ${noun}?`}
          description={`This permanently deletes this ${noun}. This can't be undone.`}
          confirmButton={
            <SubmitButton form={formId} variant="destructive" size="sm" match={intent.match} pendingLabel={`Deleting ${noun}`}>
              <Trash2Icon aria-hidden="true" />
              Delete {noun}
            </SubmitButton>
          }
        />
      )}
      {error ? <p className="text-sm font-medium text-destructive">{error}</p> : null}
    </div>
  );
}
