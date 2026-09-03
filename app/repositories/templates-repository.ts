import type { WorkoutTemplate } from "~/domain/template/workout-template";

// Port: consumers depend on this interface, not on Drizzle/Postgres
// directly. See templates-repository.server.ts for which adapter backs it at
// runtime.
//
// `save` persists the whole aggregate - the template row and its exercise
// entries - as one unit, so an adapter has to work out which entries were
// added, changed or dropped (see shared/diff-children.ts). What used to be
// eight rule-carrying methods per adapter is now this.
export interface TemplatesRepository {
  listFor(userId: string, showSampleData: boolean): Promise<WorkoutTemplate[]>;
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
