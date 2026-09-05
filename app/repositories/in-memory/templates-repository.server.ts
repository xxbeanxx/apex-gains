import { LibraryVisibility, Ownership } from '~/domain/shared/ownership';
import { WorkoutTemplate, type TemplateSnapshot } from '~/domain/template/workout-template';

import type { TemplateName, TemplatesRepository } from '../templates-repository.server';
import type { AthleteOwned, ExerciseReferences } from './references';

// Dev-convenience adapter - see templates-repository.server.ts for when it's
// selected, and athletes-repository.in-memory.server.ts for why it stores
// snapshots rather than aggregates.
//
// The whole aggregate, exercise entries included, is one snapshot, so
// nothing here needs the position bookkeeping the Drizzle adapter does - the
// ordering rules live on `WorkoutTemplate` and the positions arrive already
// correct.
export class InMemoryTemplatesRepository implements TemplatesRepository, ExerciseReferences, AthleteOwned {
  private readonly byId = new Map<string, TemplateSnapshot>();

  async listFor(userId: string, showSampleData: boolean): Promise<WorkoutTemplate[]> {
    const visible = LibraryVisibility.for(userId, showSampleData).selectFrom([...this.byId.values()]);
    return visible.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()).map(WorkoutTemplate.fromSnapshot);
  }

  async listNamesFor(userId: string, showSampleData: boolean): Promise<TemplateName[]> {
    const templates = await this.listFor(userId, showSampleData);
    return templates.map(({ id, name }) => ({ id, name }));
  }

  async findVisible(userId: string, templateId: string): Promise<WorkoutTemplate | null> {
    const snapshot = this.byId.get(templateId);
    if (!snapshot) return null;
    const visible = Ownership.fromUserId(snapshot.userId).isVisibleTo(userId);
    return visible ? WorkoutTemplate.fromSnapshot(snapshot) : null;
  }

  async findForkOf(userId: string, sampleId: string): Promise<WorkoutTemplate | null> {
    const snapshot = [...this.byId.values()].find(
      (candidate) => candidate.userId === userId && candidate.forkedFromId === sampleId,
    );
    return snapshot ? WorkoutTemplate.fromSnapshot(snapshot) : null;
  }

  async save(template: WorkoutTemplate): Promise<void> {
    const snapshot = template.toSnapshot();
    this.byId.set(snapshot.id, snapshot);
  }

  async delete(templateId: string): Promise<void> {
    this.byId.delete(templateId);
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
