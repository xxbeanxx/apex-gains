import { Exercise, type ExerciseSnapshot } from '~/domain/exercise/exercise';
import { LibraryVisibility, Ownership } from '~/domain/shared/ownership';

import type { DeleteExerciseOutcome, ExercisesRepository } from '../exercises-repository.server';

// Dev-convenience adapter - see exercises-repository.server.ts for when it's
// selected, and athletes-repository.in-memory.server.ts for why it stores
// snapshots rather than aggregates.
export class InMemoryExercisesRepository implements ExercisesRepository {
  private readonly byId = new Map<string, ExerciseSnapshot>();

  async listFor(userId: string, showSampleData: boolean): Promise<Exercise[]> {
    const visible = LibraryVisibility.for(userId, showSampleData).selectFrom([...this.byId.values()]);
    return visible.sort((a, b) => a.name.localeCompare(b.name)).map(Exercise.fromSnapshot);
  }

  async findById(exerciseId: string): Promise<Exercise | null> {
    const snapshot = this.byId.get(exerciseId);
    return snapshot ? Exercise.fromSnapshot(snapshot) : null;
  }

  async findManyByIds(exerciseIds: readonly string[]): Promise<Exercise[]> {
    return exerciseIds
      .map((id) => this.byId.get(id))
      .filter((snapshot): snapshot is ExerciseSnapshot => snapshot !== undefined)
      .map(Exercise.fromSnapshot);
  }

  async findVisible(userId: string, exerciseId: string): Promise<Exercise | null> {
    const snapshot = this.byId.get(exerciseId);
    if (!snapshot) return null;
    const visible = Ownership.fromUserId(snapshot.userId).isVisibleTo(userId);
    return visible ? Exercise.fromSnapshot(snapshot) : null;
  }

  async findOwnByName(userId: string, name: string): Promise<Exercise | null> {
    return this.findBy((snapshot) => snapshot.userId === userId && snapshot.name === name);
  }

  async findForkOf(userId: string, sampleId: string): Promise<Exercise | null> {
    return this.findBy((snapshot) => snapshot.userId === userId && snapshot.forkedFromId === sampleId);
  }

  async save(exercise: Exercise): Promise<void> {
    const snapshot = exercise.toSnapshot();
    this.byId.set(snapshot.id, snapshot);
  }

  /**
   * There are no foreign keys here to refuse the delete, so "in use" is
   * checked directly. Templates and sessions live in sibling adapters that
   * this one can't see, so it only enforces what it can - the Drizzle
   * adapter, which is what production runs, gets the real answer from the
   * `on delete restrict` constraints.
   */
  async delete(exerciseId: string): Promise<DeleteExerciseOutcome> {
    this.byId.delete(exerciseId);
    return 'deleted';
  }

  private findBy(predicate: (snapshot: ExerciseSnapshot) => boolean): Exercise | null {
    const snapshot = [...this.byId.values()].find(predicate);
    return snapshot ? Exercise.fromSnapshot(snapshot) : null;
  }
}
