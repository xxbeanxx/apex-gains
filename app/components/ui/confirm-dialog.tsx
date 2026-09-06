import type { ReactNode } from 'react';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '~/components/ui/alert-dialog';
import { Button } from '~/components/ui/button';

/**
 * Gates a destructive, whole-item action (delete, revert-to-sample) behind an
 * explicit confirmation. Agnostic to how the action itself submits -
 * `confirmButton` is whatever the caller would otherwise have rendered as the
 * bare submit button (a `<SubmitButton form={id}>` pointing at a form
 * elsewhere in the DOM, or a plain `<Button onClick={...}>` for an imperative
 * fetcher submit); it is wrapped in `AlertDialogAction` so confirming both
 * fires that submission and closes the dialog in one click.
 *
 * `trigger` covers the common case of a plain button that opens the dialog
 * itself. A trigger inside a dropdown menu has to close that menu first, so
 * pass `open`/`onOpenChange` instead and open it from the menu item's
 * `onSelect` - the same controlled pattern this app's other dialogs already
 * use from a dropdown (see `ExerciseRowMenu`).
 */
function ConfirmDialog({
  trigger,
  open,
  onOpenChange,
  title,
  description,
  confirmButton,
}: {
  trigger?: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  title: string;
  description: ReactNode;
  confirmButton: ReactNode;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      {trigger ? <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger> : null}
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel asChild>
            <Button variant="outline">Cancel</Button>
          </AlertDialogCancel>
          <AlertDialogAction asChild>{confirmButton}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export { ConfirmDialog };
