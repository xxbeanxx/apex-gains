import type { ReactNode } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useFetcher } from 'react-router';

import { ExerciseDetailsFields } from '~/components/exercises/exercise-details-fields';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '~/components/ui/dialog';
import { SubmitButton } from '~/components/ui/submit-button';
import { PlusIcon } from 'lucide-react';

import { intents } from '~/routes/exercises';

function NewExerciseForm({ onCreated }: { onCreated: () => void }) {
  const fetcher = useFetcher();
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (fetcher.state === 'idle' && fetcher.data && !('error' in fetcher.data)) {
      formRef.current?.reset();
      onCreated();
    }
  }, [fetcher.state, fetcher.data, onCreated]);

  const pending = fetcher.state !== 'idle';
  const error = fetcher.data && 'error' in fetcher.data ? fetcher.data.error : undefined;

  return (
    <fetcher.Form ref={formRef} method="post" className="flex flex-col gap-4">
      <input {...intents.createExercise.field} />
      <ExerciseDetailsFields error={error} />
      <SubmitButton pending={pending} pendingLabel="Creating exercise" variant="brand" className="self-start">
        {pending ? null : <PlusIcon aria-hidden="true" />}
        Create exercise
      </SubmitButton>
    </fetcher.Form>
  );
}

/**
 * The create form lives behind this dialog rather than on the page: creating an
 * exercise is rare, browsing the library is not, so the library gets the space.
 * The form is only mounted while the dialog is open, which is what resets its
 * fetcher state between openings.
 */
function NewExerciseDialog({ trigger }: { trigger: ReactNode }) {
  const [open, setOpen] = useState(false);
  // Stable identity: the form has this in an effect's dependencies.
  const close = useCallback(() => setOpen(false), []);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New exercise</DialogTitle>
          <DialogDescription>Equipment is linked afterward, from the exercise’s own editor.</DialogDescription>
        </DialogHeader>
        <NewExerciseForm onCreated={close} />
      </DialogContent>
    </Dialog>
  );
}

export { NewExerciseDialog };
