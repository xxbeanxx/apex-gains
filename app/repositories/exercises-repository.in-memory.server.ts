import { randomUUID } from "node:crypto";

import type { Exercise } from "~/db/schema";

import type { EquipmentRepository } from "./equipment-repository";
import type {
  CreateExerciseResult,
  ExerciseDetails,
  ExercisesRepository,
  ExerciseWithEquipment,
  RevertExerciseResult,
  UpdateExerciseResult,
} from "./exercises-repository";

// Dev-convenience adapter for running the app without a database
// configured (see exercises-repository.server.ts for the selection rule).
// Data lives only for the life of the process.
//
// Two things it does NOT replicate from the Drizzle adapter:
//  - Postgres blocks deleting an exercise still referenced by a template or
//    a logged set (see `revert` below), a constraint owned by tables that
//    aren't ported to an in-memory adapter yet. `revert` always succeeds
//    here.
//  - `create` always assigns the given userId as owner. There's no
//    in-memory equivalent of db/seed.ts yet, so nothing ever produces a
//    sample (userId null) exercise in this adapter - the fork-on-write path
//    below exists for parity with the port's contract but is presently
//    unreachable until an in-memory seeding story exists.
export class InMemoryExercisesRepository implements ExercisesRepository {
  private readonly exercisesById = new Map<string, Exercise>();
  private readonly equipmentLinksByExerciseId = new Map<string, Set<string>>();

  constructor(private readonly equipmentRepository: EquipmentRepository) {}

  async listWithEquipmentForUser(
    userId: string,
    showSampleData: boolean,
  ): Promise<ExerciseWithEquipment[]> {
    const all = [...this.exercisesById.values()];
    const ownRows = all.filter((row) => row.userId === userId);
    const forkedSampleIds = new Set(
      ownRows
        .map((row) => row.forkedFromId)
        .filter((id): id is string => id !== null),
    );
    const rows = showSampleData
      ? [
          ...ownRows,
          ...all.filter(
            (row) => row.userId === null && !forkedSampleIds.has(row.id),
          ),
        ]
      : ownRows;

    const sorted = rows.sort((a, b) => a.name.localeCompare(b.name));
    return Promise.all(
      sorted.map(async (exercise) => ({
        ...exercise,
        equipmentLinks: await this.equipmentLinksFor(exercise.id),
      })),
    );
  }

  async findById(exerciseId: string) {
    return this.exercisesById.get(exerciseId) ?? null;
  }

  async create(
    userId: string,
    input: ExerciseDetails,
  ): Promise<CreateExerciseResult> {
    const duplicate = [...this.exercisesById.values()].some(
      (row) => row.userId === userId && row.name === input.name,
    );
    if (duplicate) return { outcome: "duplicate-name" };

    const exercise: Exercise = {
      id: randomUUID(),
      userId,
      forkedFromId: null,
      name: input.name,
      exerciseType: input.exerciseType,
      muscleGroup: input.muscleGroup ?? null,
      description: input.description ?? null,
      createdAt: new Date(),
    };
    this.exercisesById.set(exercise.id, exercise);
    return { outcome: "created", exercise };
  }

  async update(
    userId: string,
    exerciseId: string,
    input: ExerciseDetails,
  ): Promise<UpdateExerciseResult> {
    const exercise = this.exercisesById.get(exerciseId);
    if (!exercise) return { outcome: "not-found" };

    const target =
      exercise.userId === null ? this.forkForUser(exercise, userId) : exercise;

    const duplicate = [...this.exercisesById.values()].some(
      (row) =>
        row.id !== target.id && row.userId === userId && row.name === input.name,
    );
    if (duplicate) return { outcome: "duplicate-name" };

    this.exercisesById.set(target.id, {
      ...target,
      name: input.name,
      exerciseType: input.exerciseType,
      muscleGroup: input.muscleGroup ?? null,
      description: input.description ?? null,
    });
    return { outcome: "updated" };
  }

  async toggleEquipment(
    userId: string,
    exerciseId: string,
    equipmentId: string,
    checked: boolean,
  ): Promise<void> {
    const exercise = this.exercisesById.get(exerciseId);
    if (!exercise) return;

    const target =
      exercise.userId === null ? this.forkForUser(exercise, userId) : exercise;

    const links = this.equipmentLinksByExerciseId.get(target.id) ?? new Set();
    if (checked) {
      links.add(equipmentId);
    } else {
      links.delete(equipmentId);
    }
    this.equipmentLinksByExerciseId.set(target.id, links);
  }

  async revert(
    userId: string,
    exerciseId: string,
  ): Promise<RevertExerciseResult> {
    const exercise = this.exercisesById.get(exerciseId);
    if (!exercise || exercise.userId !== userId || !exercise.forkedFromId) {
      return { outcome: "nothing-to-revert" };
    }
    this.exercisesById.delete(exerciseId);
    this.equipmentLinksByExerciseId.delete(exerciseId);
    return { outcome: "reverted" };
  }

  private forkForUser(sample: Exercise, userId: string): Exercise {
    const existingFork = [...this.exercisesById.values()].find(
      (row) => row.userId === userId && row.forkedFromId === sample.id,
    );
    if (existingFork) return existingFork;

    const fork: Exercise = {
      ...sample,
      id: randomUUID(),
      userId,
      forkedFromId: sample.id,
      createdAt: new Date(),
    };
    this.exercisesById.set(fork.id, fork);

    const sampleLinks = this.equipmentLinksByExerciseId.get(sample.id);
    if (sampleLinks && sampleLinks.size > 0) {
      this.equipmentLinksByExerciseId.set(fork.id, new Set(sampleLinks));
    }

    return fork;
  }

  private async equipmentLinksFor(
    exerciseId: string,
  ): Promise<ExerciseWithEquipment["equipmentLinks"]> {
    const equipmentIds = this.equipmentLinksByExerciseId.get(exerciseId);
    if (!equipmentIds || equipmentIds.size === 0) return [];

    const equipment = await Promise.all(
      [...equipmentIds].map((id) => this.equipmentRepository.findById(id)),
    );
    return equipment
      .filter((row) => row !== null)
      .map((equipment) => ({ equipment }));
  }
}
