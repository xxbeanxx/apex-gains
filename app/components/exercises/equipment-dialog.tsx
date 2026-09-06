import type { ReactNode } from 'react';
import { useEffect, useId, useRef, useState } from 'react';
import { useFetcher } from 'react-router';
import { XIcon } from 'lucide-react';

import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { ConfirmDialog } from '~/components/ui/confirm-dialog';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '~/components/ui/dialog';
import { Field } from '~/components/ui/field';
import { Input } from '~/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/components/ui/select';
import { SubmitButton } from '~/components/ui/submit-button';
import type { EquipmentView } from '~application/use-cases/exercise-library-service';

import { cardioKindLabels, intents, NO_CARDIO_KIND } from '~/routes/exercises';

function EquipmentRow({ equipment }: { equipment: EquipmentView }) {
  const deleteFetcher = useFetcher();
  const cardioKindFetcher = useFetcher();
  const [cardioKind, setCardioKind] = useState(equipment.cardioKind ?? NO_CARDIO_KIND);
  const deleteFormId = useId();

  return (
    // Hidden while its own delete is in flight so the row goes away on click
    // rather than at the end of the revalidation round-trip.
    <li className="flex items-center gap-2 px-3 py-2" hidden={deleteFetcher.state !== 'idle'}>
      <span className="min-w-0 flex-1 text-pretty">{equipment.name}</span>
      {equipment.isSample ? (
        <>
          {equipment.cardioKind ? <Badge variant="outline">{cardioKindLabels[equipment.cardioKind]}</Badge> : null}
          <Badge variant="outline">Sample</Badge>
        </>
      ) : (
        <>
          <Select
            value={cardioKind}
            onValueChange={(value) => {
              setCardioKind(value);
              cardioKindFetcher.submit(
                { intent: intents.setEquipmentCardioKind.name, equipmentId: equipment.id, cardioKind: value },
                { method: 'post' },
              );
            }}
          >
            <SelectTrigger size="sm" aria-label={`Cardio fields for ${equipment.name}`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_CARDIO_KIND}>Speed & resistance</SelectItem>
              <SelectItem value="speed">Speed only</SelectItem>
              <SelectItem value="resistance">Resistance only</SelectItem>
            </SelectContent>
          </Select>
          <deleteFetcher.Form method="post" id={deleteFormId} className="contents">
            <input {...intents.deleteEquipment.field} />
            <input type="hidden" name="equipmentId" value={equipment.id} />
          </deleteFetcher.Form>
          <ConfirmDialog
            trigger={
              <Button type="button" variant="ghost" size="icon-sm">
                <XIcon aria-hidden="true" />
                <span className="sr-only">Remove {equipment.name}</span>
              </Button>
            }
            title={`Remove ${equipment.name}?`}
            description="This removes it from every exercise that links to it. This can't be undone."
            confirmButton={
              <SubmitButton form={deleteFormId} variant="destructive" pendingLabel={`Removing ${equipment.name}`}>
                Remove
              </SubmitButton>
            }
          />
        </>
      )}
    </li>
  );
}

function EquipmentDialog({ equipment, trigger }: { equipment: EquipmentView[]; trigger: ReactNode }) {
  const fetcher = useFetcher();
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (fetcher.state === 'idle' && fetcher.data && !('error' in fetcher.data)) {
      formRef.current?.reset();
    }
  }, [fetcher.state, fetcher.data]);

  const error = fetcher.data && 'error' in fetcher.data ? fetcher.data.error : undefined;

  return (
    <Dialog>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Equipment</DialogTitle>
          <DialogDescription>
            Add the equipment you own, then link it to exercises from each exercise’s editor. An exercise can use more than one
            — e.g. Standing Biceps Curl on both the BowFlex and free weights.
          </DialogDescription>
        </DialogHeader>

        {equipment.length > 0 ? (
          <ul className="divide-y divide-border/60 overflow-hidden rounded-lg ring-1 ring-foreground/10">
            {equipment.map((eq) => (
              <EquipmentRow key={eq.id} equipment={eq} />
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No equipment yet. Add your first one below.</p>
        )}

        <fetcher.Form ref={formRef} method="post" className="flex flex-wrap items-end gap-3">
          <input {...intents.addEquipment.field} />
          <Field label="Add equipment" error={error} className="min-w-40 flex-1">
            <Input name="name" placeholder="Free Weights" required />
          </Field>
          <Field label="Cardio fields" className="w-44">
            {({ id }) => (
              <Select name="cardioKind" defaultValue={NO_CARDIO_KIND}>
                <SelectTrigger id={id} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_CARDIO_KIND}>Speed & resistance</SelectItem>
                  <SelectItem value="speed">Speed only</SelectItem>
                  <SelectItem value="resistance">Resistance only</SelectItem>
                </SelectContent>
              </Select>
            )}
          </Field>
          <SubmitButton pending={fetcher.state !== 'idle'} pendingLabel="Adding equipment">
            Add
          </SubmitButton>
        </fetcher.Form>
      </DialogContent>
    </Dialog>
  );
}

export { EquipmentDialog };
