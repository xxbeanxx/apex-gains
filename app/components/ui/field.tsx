import * as React from 'react';
import { type ReactElement, type ReactNode, cloneElement, useId } from 'react';

import { Label } from '~/components/ui/label';
import { cn } from '~/lib/utils';

type FieldRenderArgs = {
  /** Unique per-instance id. Wire this onto the control. */
  id: string;
  /** Pass to the control as `aria-describedby`. Undefined when nothing to say. */
  describedBy: string | undefined;
  invalid: boolean;
};

type FieldProps = {
  label: ReactNode;
  /** Helper text rendered under the label and linked via aria-describedby. */
  description?: ReactNode;
  /** Error text. Presence marks the control aria-invalid. */
  error?: ReactNode;
  /**
   * Control rendered inline beside the input - typically a submit button.
   * Living in the control row is what keeps it aligned with the input no
   * matter how tall the label and description above it turn out to be.
   */
  action?: ReactNode;
  className?: string;
  labelClassName?: string;
  children:
    | ReactElement<Partial<{ 'id': string; 'aria-describedby': string; 'aria-invalid': boolean }>>
    | ((args: FieldRenderArgs) => ReactNode);
};

/**
 * Label + control + description + error, with ids generated per instance.
 *
 * The generated id is why this exists: several routes render two forms on one
 * page that both used `id="name"`, so one `<label for>` pointed at the other
 * form's input. `useId` makes collisions impossible.
 *
 * Pass a single element child and it is cloned with the wiring applied, or
 * pass a function for controls that need the id somewhere other than the root
 * (Radix `Select` puts it on `SelectTrigger`, not on `Select`).
 */
function Field({ label, description, error, action, className, labelClassName, children }: FieldProps) {
  const reactId = useId();
  const id = `field-${reactId}`;
  const descriptionId = description ? `${id}-description` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [descriptionId, errorId].filter(Boolean).join(' ') || undefined;
  const invalid = Boolean(error);

  const args: FieldRenderArgs = { id, describedBy, invalid };

  const control =
    typeof children === 'function'
      ? children(args)
      : cloneElement(children, {
          id,
          'aria-describedby': describedBy,
          'aria-invalid': invalid || undefined,
        });

  return (
    <div data-slot="field" className={cn('flex flex-col gap-2', className)}>
      <Label htmlFor={id} className={labelClassName}>
        {label}
      </Label>
      {description ? (
        <p id={descriptionId} className="text-xs text-muted-foreground">
          {description}
        </p>
      ) : null}
      {action ? (
        <div className="flex items-center gap-2 *:data-[slot=input]:flex-1 *:data-[slot=select-trigger]:flex-1">
          {control}
          {action}
        </div>
      ) : (
        control
      )}
      {error ? (
        <p id={errorId} className="text-sm font-medium text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export { Field };
