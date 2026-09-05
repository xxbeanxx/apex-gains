import { RotateCcwIcon } from 'lucide-react';
import { useState } from 'react';
import { useFetcher } from 'react-router';

import { ExerciseDetailsFields } from '~/components/exercises/exercise-details-fields';
import { Checkbox } from '~/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '~/components/ui/dialog';
import { SubmitButton } from '~/components/ui/submit-button';
import type { EquipmentView, ExerciseView } from '~/services/exercise-library-service.server';

import { intents } from '~/routes/exercises';

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
    <label className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm transition-colors duration-(--dur-fast) hover:bg-muted has-[:focus-visible]:bg-muted">
      <Checkbox
        checked={checked}
        onCheckedChange={(value) => {
          const isChecked = value === true;
          setChecked(isChecked);
          fetcher.submit(
            {
              intent: intents.toggleExerciseEquipment.name,
              exerciseId,
              equipmentId,
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

/** Name/type/muscle/description, equipment links, and - for a customized copy - reverting to the sample. */
function ExerciseEditorDialog({
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
          <div className="flex flex-col gap-2 rounded-lg bg-muted px-3 py-2.5 text-sm">
            <p className="text-muted-foreground">
              This is your customized copy of a sample exercise. The original sample is unaffected.
            </p>
            <revertFetcher.Form method="post" className="flex flex-col gap-2">
              <input {...intents.revertExercise.field} />
              <input type="hidden" name="exerciseId" value={exercise.id} />
              {revertError ? <p className="text-destructive">{revertError}</p> : null}
              <SubmitButton
                variant="outline"
                size="sm"
                pending={revertFetcher.state !== 'idle'}
                pendingLabel="Reverting"
                className="self-start"
              >
                <RotateCcwIcon aria-hidden="true" />
                Revert to sample
              </SubmitButton>
            </revertFetcher.Form>
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

        <div className="flex flex-col gap-3 border-t border-border pt-4">
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
            <p className="text-sm text-muted-foreground">No equipment yet — add some with “Manage equipment” first.</p>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export { ExerciseEditorDialog };
