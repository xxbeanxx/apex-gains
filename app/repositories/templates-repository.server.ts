import type { WorkoutTemplate } from "~/domain/template/workout-template";

// Port: consumers depend on this interface, not on Drizzle/Postgres
// directly. The factory below picks which adapter backs it at runtime.
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

let repository: TemplatesRepository | undefined;

// Ports and adapters: pick the adapter once per process and cache it, so
// the in-memory adapter's state actually persists across requests. See
// athletes-repository.server.ts for why the adapter modules are imported
// dynamically rather than at the top of this file.
export async function getTemplatesRepository(): Promise<TemplatesRepository> {
  if (!repository) {
    repository = process.env.DATABASE_URL
      ? new (
          await import("./drizzle/templates-repository.server")
        ).DrizzleTemplatesRepository()
      : new (
          await import("./in-memory/templates-repository.server")
        ).InMemoryTemplatesRepository();
  }
  return repository;
}
