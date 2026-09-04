import type { WorkoutTemplate } from "~/domain/template/workout-template";

// Port: consumers depend on this interface, not on Drizzle/Postgres
// directly. `server/repositories/repositories.module.ts` picks which
// adapter backs it.
//
// `save` persists the whole aggregate - the template row and its exercise
// entries - as one unit, so an adapter has to work out which entries were
// added, changed or dropped (see shared/diff-children.ts).
/** Just enough of a template to label a routine slot or fill a picker. */
export type TemplateName = {
  readonly id: string;
  readonly name: string;
};

export interface TemplatesRepository {
  listFor(userId: string, showSampleData: boolean): Promise<WorkoutTemplate[]>;
  /**
   * The same set as `listFor`, but names only.
   *
   * Resolving a routine slot's `templateId` to something displayable does not
   * need the template's exercise entries, and hydrating a whole aggregate per
   * slot to read one string is the kind of cost that only shows up once the
   * library is large. Callers that render a name go through this.
   */
  listNamesFor(
    userId: string,
    showSampleData: boolean,
  ): Promise<TemplateName[]>;
  findVisible(
    userId: string,
    templateId: string,
  ): Promise<WorkoutTemplate | null>;
  findForkOf(
    userId: string,
    sampleId: string,
  ): Promise<WorkoutTemplate | null>;
  save(template: WorkoutTemplate): Promise<void>;
  delete(templateId: string): Promise<void>;
}
