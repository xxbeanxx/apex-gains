import type { Exercise, Template, TemplateExercise } from "~/db/schema";

export type TemplateWithExerciseCount = Template & {
  templateExercises: { id: string; position: number }[];
};

export type TemplateExerciseWithExercise = TemplateExercise & {
  exercise: Exercise;
};

export type TemplateDetail = Template & {
  templateExercises: TemplateExerciseWithExercise[];
};

export type AddTemplateExerciseInput = {
  exerciseId: string;
  targetSets?: number | null;
  targetReps?: number | null;
  targetWeight?: number | null;
  targetDurationSeconds?: number | null;
  targetSpeed?: number | null;
  targetResistance?: number | null;
};

export type TemplateNotFound = { outcome: "not-found" };

export type DeleteTemplateOutcome =
  | TemplateNotFound
  | { outcome: "sample-template" }
  | { outcome: "deleted" };

export type RevertTemplateOutcome =
  | TemplateNotFound
  | { outcome: "nothing-to-revert" }
  | { outcome: "reverted"; forkedFromId: string };

export type RenameTemplateOutcome =
  | TemplateNotFound
  | { outcome: "renamed"; forkedTemplateId: string | null };

export type AddTemplateExerciseOutcome =
  | TemplateNotFound
  | { outcome: "exercise-not-found" }
  | { outcome: "added"; forkedTemplateId: string | null };

export type RemoveTemplateExerciseOutcome =
  | TemplateNotFound
  | { outcome: "removed"; forkedTemplateId: string | null };

export type MoveTemplateExerciseOutcome =
  | TemplateNotFound
  | { outcome: "moved"; forkedTemplateId: string | null }
  // Out-of-range move (e.g. moving the first item up): still forks a sample
  // template first, same as every other mutating intent, but doesn't
  // reorder anything - matches the route's existing behavior.
  | { outcome: "no-op"; forkedTemplateId: string | null };

// Port: consumers depend on this interface, not on Drizzle/Postgres
// directly. See templates-repository.server.ts for which adapter backs it
// at runtime.
//
// Every mutating method here forks a sample (userId null) template into a
// personal copy before applying its change, folding "fork on first edit"
// (see CLAUDE.md's "Sample data and fork-on-write") into the same
// operation and the same transaction as the edit itself. `forkedTemplateId`
// on the result is set when that happened, so the route can redirect to
// the fork's own URL - the edit is otherwise invisible at the original,
// still-sample URL.
export interface TemplatesRepository {
  listForUser(
    userId: string,
    showSampleData: boolean,
  ): Promise<TemplateWithExerciseCount[]>;
  findVisibleForUser(
    userId: string,
    templateId: string,
  ): Promise<TemplateDetail | null>;
  create(userId: string, name: string): Promise<Template>;
  delete(userId: string, templateId: string): Promise<DeleteTemplateOutcome>;
  revert(userId: string, templateId: string): Promise<RevertTemplateOutcome>;
  rename(
    userId: string,
    templateId: string,
    name: string,
  ): Promise<RenameTemplateOutcome>;
  addExercise(
    userId: string,
    templateId: string,
    input: AddTemplateExerciseInput,
  ): Promise<AddTemplateExerciseOutcome>;
  removeExercise(
    userId: string,
    templateId: string,
    templateExerciseId: string,
  ): Promise<RemoveTemplateExerciseOutcome>;
  moveExercise(
    userId: string,
    templateId: string,
    templateExerciseId: string,
    direction: "up" | "down",
  ): Promise<MoveTemplateExerciseOutcome>;
}
