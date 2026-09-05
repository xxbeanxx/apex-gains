import { Field } from '~/components/ui/field';
import { Input } from '~/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/components/ui/select';
import { Textarea } from '~/components/ui/textarea';

/** Every id here comes from `Field`'s `useId`, so rendering this block twice on one page - the create form and an edit dialog - never produces colliding ids or labels pointing at the wrong input. */
function ExerciseDetailsFields({
  defaultValues,
  error,
}: {
  defaultValues?: {
    name: string;
    exerciseType: string;
    muscleGroup: string | null;
    description: string | null;
  };
  error?: string;
}) {
  return (
    <div className="flex flex-col gap-4">
      <Field label="Name" error={error}>
        <Input name="name" defaultValue={defaultValues?.name} placeholder="Cable Crossover" required />
      </Field>
      <Field label="Type">
        {({ id }) => (
          <Select name="exerciseType" defaultValue={defaultValues?.exerciseType ?? 'strength'}>
            <SelectTrigger id={id} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="strength">Strength</SelectItem>
              <SelectItem value="cardio">Cardio</SelectItem>
            </SelectContent>
          </Select>
        )}
      </Field>
      <Field label="Muscle group">
        <Input name="muscleGroup" defaultValue={defaultValues?.muscleGroup ?? ''} placeholder="chest" />
      </Field>
      <Field label="Description">
        <Textarea
          name="description"
          defaultValue={defaultValues?.description ?? ''}
          placeholder="How to perform this exercise, form cues, etc."
          rows={3}
        />
      </Field>
    </div>
  );
}

export { ExerciseDetailsFields };
