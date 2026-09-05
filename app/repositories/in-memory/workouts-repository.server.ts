import { LibraryVisibility, Ownership } from '~/domain/shared/ownership';
import { Workout, type WorkoutSnapshot } from '~/domain/workout/workout';

import type { WorkoutName, WorkoutsRepository } from '../workouts-repository.server';
import type { AthleteOwned, ExerciseReferences } from './references';

// Dev-convenience adapter - see workouts-repository.server.ts for when it's
// selected, and athletes-repository.in-memory.server.ts for why it stores
// snapshots rather than aggregates.
//
// The whole aggregate, exercise entries included, is one snapshot, so
// nothing here needs the position bookkeeping the Drizzle adapter does - the
// ordering rules live on `Workout` and the positions arrive already
// correct.
export class InMemoryWorkoutsRepository implements WorkoutsRepository, ExerciseReferences, AthleteOwned {
  private readonly byId = new Map<string, WorkoutSnapshot>();

  async listFor(userId: string, showSampleData: boolean): Promise<Workout[]> {
    const visible = LibraryVisibility.for(userId, showSampleData).selectFrom([...this.byId.values()]);
    return visible.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()).map(Workout.fromSnapshot);
  }

  async listNamesFor(userId: string, showSampleData: boolean): Promise<WorkoutName[]> {
    const workouts = await this.listFor(userId, showSampleData);
    return workouts.map(({ id, name }) => ({ id, name }));
  }

  async findVisible(userId: string, workoutId: string): Promise<Workout | null> {
    const snapshot = this.byId.get(workoutId);
    if (!snapshot) return null;
    const visible = Ownership.fromUserId(snapshot.userId).isVisibleTo(userId);
    return visible ? Workout.fromSnapshot(snapshot) : null;
  }

  async findManyByIds(workoutIds: readonly string[]): Promise<Workout[]> {
    const wanted = new Set(workoutIds);
    return [...this.byId.values()].filter((snapshot) => wanted.has(snapshot.id)).map(Workout.fromSnapshot);
  }

  async findForkOf(userId: string, sampleId: string): Promise<Workout | null> {
    const snapshot = [...this.byId.values()].find(
      (candidate) => candidate.userId === userId && candidate.forkedFromId === sampleId,
    );
    return snapshot ? Workout.fromSnapshot(snapshot) : null;
  }

  async save(workout: Workout): Promise<void> {
    const snapshot = workout.toSnapshot();
    this.byId.set(snapshot.id, snapshot);
  }

  async delete(workoutId: string): Promise<void> {
    this.byId.delete(workoutId);
  }

  referencesExercise(exerciseId: string): boolean {
    return [...this.byId.values()].some((snapshot) => snapshot.exercises.some((entry) => entry.exerciseId === exerciseId));
  }

  removeAllFor(userId: string): void {
    for (const [id, snapshot] of this.byId) {
      if (snapshot.userId === userId) this.byId.delete(id);
    }
  }
}
