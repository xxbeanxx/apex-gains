import { RotateCcwIcon } from 'lucide-react';
import { useId, useState } from 'react';
import { useFetcher } from 'react-router';
import type { EquipmentView, ExerciseView } from '~application/use-cases/exercise-library-service';
import { ExerciseDetailsFields } from '~web/components/exercises/exercise-details-fields';
import { Button } from '~web/components/ui/button';
import { Checkbox } from '~web/components/ui/checkbox';
import { ConfirmDialog } from '~web/components/ui/confirm-dialog';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '~web/components/ui/dialog';
import { SubmitButton } from '~web/components/ui/submit-button';
import { intents } from '~web/routes/exercises';

function EquipmentCheckboxRow({
  exerciseId,
  equipmentId,
  name,
  defaultChecked,
}: {
  exerciseId: string;
  equipmentId: string;
  name: string;
  defaultChecked: boolean;
}) {
  const fetcher = useFetcher();
  const [checked, setChecked] = useState(defaultChecked);

  return (
    <label className="hover:bg-muted has-[:focus-visible]:bg-muted flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm transition-colors duration-(--dur-fast)">
      <Checkbox
        checked={checked}
        onCheckedChange={(value) => {
          const isChecked = value === true;
          setChecked(isChecked);
          void fetcher.submit(
            {
              intent: intents.toggleExerciseEquipment.name,
              exerciseId: exerciseId,
              equipmentId: equipmentId,
              checked: String(isChecked),
            },
            { method: 'post' },
          );
        }}
      />
      {name}
    </label>
  );
}

/**
 * Name/type/muscle/description, equipment links, and - for a customized copy - reverting to the sample.
 */
export function ExerciseEditorDialog({
  exercise,
  allEquipment,
  open,
  onOpenChange,
}: {
  exercise: ExerciseView;
  allEquipment: EquipmentView[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const fetcher = useFetcher();
  const revertFetcher = useFetcher();
  const revertFormId = useId();
  const linkedIds = new Set(exercise.equipment.map((item) => item.id));
  const isCustomized = exercise.canRevert;

  const error = fetcher.data && 'error' in fetcher.data ? fetcher.data.error : undefined;
  const revertError = revertFetcher.data && 'error' in revertFetcher.data ? revertFetcher.data.error : undefined;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{exercise.name}</DialogTitle>
        </DialogHeader>
        {isCustomized ? (
          <div className="bg-muted flex flex-col gap-2 rounded-lg px-3 py-2.5 text-sm">
            <p className="text-muted-foreground">
              This is your customized copy of a sample exercise. The original sample is unaffected.
            </p>
            <revertFetcher.Form method="post" id={revertFormId} className="contents">
              <input {...intents.revertExercise.field} />
              <input type="hidden" name="exerciseId" value={exercise.id} />
            </revertFetcher.Form>
            {revertError ? <p className="text-destructive">{revertError}</p> : null}
            <ConfirmDialog
              trigger={
                <Button type="button" variant="outline" size="sm" className="self-start">
                  <RotateCcwIcon aria-hidden="true" />
                  Revert to sample
                </Button>
              }
              title="Revert to sample exercise?"
              description="Your changes to this exercise will be discarded and it will go back to matching the shared sample. This can't be undone."
              confirmButton={
                <SubmitButton
                  form={revertFormId}
                  variant="outline"
                  size="sm"
                  pending={revertFetcher.state !== 'idle'}
                  pendingLabel="Reverting"
                >
                  <RotateCcwIcon aria-hidden="true" />
                  Revert to sample
                </SubmitButton>
              }
            />
          </div>
        ) : null}
        <fetcher.Form method="post" className="flex flex-col gap-4">
          <input {...intents.updateExercise.field} />
          <input type="hidden" name="exerciseId" value={exercise.id} />
          <ExerciseDetailsFields defaultValues={exercise} error={error} />
          <SubmitButton pending={fetcher.state !== 'idle'} pendingLabel="Saving exercise" className="self-start">
            Save
          </SubmitButton>
        </fetcher.Form>

        <div className="border-border flex flex-col gap-3 border-t pt-4">
          <p className="text-sm font-medium">Equipment</p>
          {allEquipment.map((eq) => (
            <EquipmentCheckboxRow
              key={eq.id}
              exerciseId={exercise.id}
              equipmentId={eq.id}
              name={eq.name}
              defaultChecked={linkedIds.has(eq.id)}
            />
          ))}
          {allEquipment.length === 0 ? (
            <p className="text-muted-foreground text-sm">No equipment yet — add some with “Manage equipment” first.</p>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
