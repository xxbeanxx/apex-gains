import { ArrowDownIcon, ArrowUpIcon, EllipsisIcon, XIcon } from 'lucide-react';
import { Form, useSubmit } from 'react-router';

import { Button } from '~/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '~/components/ui/dropdown-menu';
import type { Intent } from '~/lib/intent';

/**
 * The intents a builder row submits, and the form field that names the row
 * to them - `slotId` on a plan, `workoutExerciseId` on a workout.
 */
type RowIntent = Pick<Intent<never>, 'field' | 'name'>;

type RowTarget = {
  /**
   * The row's id, posted as `idField`.
   */
  id: string;
  idField: string;
  /**
   * How the row is named to a screen reader and in the e2e suite: "Move
   * `label` up", "Actions for `label`".
   */
  label: string;
};

/**
 * A row's up/down pair: two plain `<Form>`s posting `move` with a
 * `direction`, disabled at either end of the list.
 */
function RowMoveButtons({
  move,
  id,
  idField,
  label,
  index,
  count,
}: RowTarget & { move: RowIntent; index: number; count: number }) {
  return (
    <>
      {(['up', 'down'] as const).map((direction) => (
        <Form method="post" key={direction}>
          <input {...move.field} />
          <input type="hidden" name={idField} value={id} />
          <input type="hidden" name="direction" value={direction} />
          <Button
            type="submit"
            variant="ghost"
            size="icon-sm"
            disabled={direction === 'up' ? index === 0 : index === count - 1}
          >
            {direction === 'up' ? <ArrowUpIcon aria-hidden="true" /> : <ArrowDownIcon aria-hidden="true" />}
            <span className="sr-only">
              Move {label} {direction}
            </span>
          </Button>
        </Form>
      ))}
    </>
  );
}

/**
 * The `⋯` menu's one action: removing the row. A plain navigation submit, the
 * same request cycle a literal form's own submit would make - a menu item
 * can't sit inside a form, and removing a row is one click on purpose.
 */
function RowRemoveMenu({ remove, id, idField, label }: RowTarget & { remove: RowIntent }) {
  const submit = useSubmit();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${label}`}>
          <EllipsisIcon aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          variant="destructive"
          onSelect={() => submit({ intent: remove.name, [idField]: id }, { method: 'post' })}
        >
          <XIcon aria-hidden="true" />
          Remove
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export { RowMoveButtons, RowRemoveMenu };
