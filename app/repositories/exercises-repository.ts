import type { Equipment, Exercise } from "~/db/schema";

export type ExerciseDetails = {
  name: string;
  exerciseType: "strength" | "cardio";
  muscleGroup?: string | null;
  description?: string | null;
};

export type ExerciseWithEquipment = Exercise & {
  equipmentLinks: { equipment: Equipment }[];
};

export type CreateExerciseResult =
  | { outcome: "created"; exercise: Exercise }
  | { outcome: "duplicate-name" };

export type UpdateExerciseResult =
  | { outcome: "updated" }
  | { outcome: "duplicate-name" }
  | { outcome: "not-found" };

export type RevertExerciseResult =
  | { outcome: "reverted" }
  | { outcome: "nothing-to-revert" }
  // The exercise is still referenced by a template or a logged set.
  | { outcome: "in-use" };

// Port: consumers depend on this interface, not on Drizzle/Postgres
// directly. See exercises-repository.server.ts for which adapter backs it
// at runtime.
//
// Methods are shaped around the app's use cases (not raw CRUD) because
// several of them are "fork the sample row on first edit, then mutate it"
// as one atomic step - see CLAUDE.md's "Sample data and fork-on-write".
// Each adapter is responsible for its own atomicity (a real transaction
// for Drizzle, nothing extra needed for the single-threaded in-memory
// adapter) rather than the port exposing a transaction concept.
export interface ExercisesRepository {
  listWithEquipmentForUser(
    userId: string,
    showSampleData: boolean,
  ): Promise<ExerciseWithEquipment[]>;
  findById(exerciseId: string): Promise<Exercise | null>;
  create(
    userId: string,
    input: ExerciseDetails,
  ): Promise<CreateExerciseResult>;
  update(
    userId: string,
    exerciseId: string,
    input: ExerciseDetails,
  ): Promise<UpdateExerciseResult>;
  // No-ops if exerciseId doesn't exist, matching the route's current
  // behavior of silently ignoring a toggle on a since-deleted exercise.
  toggleEquipment(
    userId: string,
    exerciseId: string,
    equipmentId: string,
    checked: boolean,
  ): Promise<void>;
  revert(userId: string, exerciseId: string): Promise<RevertExerciseResult>;
}
