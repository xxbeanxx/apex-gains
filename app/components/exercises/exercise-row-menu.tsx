import { useState } from 'react';

import { useFetcher } from 'react-router';

import { EllipsisIcon, HistoryIcon, PencilIcon, RotateCcwIcon } from 'lucide-react';

import { ExerciseEditorDialog } from '~/components/exercises/exercise-editor-dialog';
import { ExerciseHistoryDialog } from '~/components/exercises/exercise-history-dialog';
import { Button } from '~/components/ui/button';
import { ConfirmDialog } from '~/components/ui/confirm-dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '~/components/ui/dropdown-menu';
import { SubmitButton } from '~/components/ui/submit-button';
import { intents } from '~/routes/exercises';
import type { EquipmentView, ExerciseView } from '~application/use-cases/exercise-library-service';

/** The `⋯` menu every exercise row (table or card) ends in: edit, recent history, and reverting a customized copy. */
function ExerciseRowMenu({ exercise, allEquipment }: { exercise: ExerciseView; allEquipment: EquipmentView[] }) {
  const [editOpen, setEditOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [revertConfirmOpen, setRevertConfirmOpen] = useState(false);
  const revertFetcher = useFetcher();

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${exercise.name}`}>
            <EllipsisIcon aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setEditOpen(true)}>
            <PencilIcon aria-hidden="true" />
            Edit
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setHistoryOpen(true)}>
            <HistoryIcon aria-hidden="true" />
            History
          </DropdownMenuItem>
          {exercise.canRevert ? (
            <DropdownMenuItem
              onSelect={(event) => {
                event.preventDefault();
                setRevertConfirmOpen(true);
              }}
            >
              <RotateCcwIcon aria-hidden="true" />
              Revert to sample
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      <ExerciseEditorDialog exercise={exercise} allEquipment={allEquipment} open={editOpen} onOpenChange={setEditOpen} />
      <ExerciseHistoryDialog
        exerciseId={exercise.id}
        exerciseName={exercise.name}
        open={historyOpen}
        onOpenChange={setHistoryOpen}
      />
      {exercise.canRevert ? (
        <ConfirmDialog
          open={revertConfirmOpen}
          onOpenChange={setRevertConfirmOpen}
          title="Revert to sample exercise?"
          description="Your changes to this exercise will be discarded and it will go back to matching the shared sample. This can't be undone."
          confirmButton={
            <SubmitButton
              variant="outline"
              pending={revertFetcher.state !== 'idle'}
              pendingLabel="Reverting"
              onClick={() =>
                revertFetcher.submit({ intent: intents.revertExercise.name, exerciseId: exercise.id }, { method: 'post' })
              }
            >
              <RotateCcwIcon aria-hidden="true" />
              Revert to sample
            </SubmitButton>
          }
        />
      ) : null}
    </>
  );
}

export { ExerciseRowMenu };
