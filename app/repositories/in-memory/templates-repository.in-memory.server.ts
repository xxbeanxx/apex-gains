import {
  WorkoutTemplate,
  type TemplateSnapshot,
} from "~/domain/template/workout-template";

import type { TemplatesRepository } from "../templates-repository.server";

// Dev-convenience adapter - see templates-repository.server.ts for when it's
// selected, and athletes-repository.in-memory.server.ts for why it stores
// snapshots rather than aggregates.
//
// The whole aggregate, exercise entries included, is one snapshot, so
// nothing here needs the position bookkeeping the Drizzle adapter does - the
// ordering rules live on `WorkoutTemplate` and the positions arrive already
// correct.
export class InMemoryTemplatesRepository implements TemplatesRepository {
  private readonly byId = new Map<string, TemplateSnapshot>();

  async listFor(
    userId: string,
    showSampleData: boolean,
  ): Promise<WorkoutTemplate[]> {
    const all = [...this.byId.values()];
    const own = all.filter((snapshot) => snapshot.userId === userId);
    const forkedSampleIds = new Set(
      own
        .map((snapshot) => snapshot.forkedFromId)
        .filter((id): id is string => id !== null),
    );

    const visible = showSampleData
      ? [
          ...own,
          ...all.filter(
            (snapshot) =>
              snapshot.userId === null && !forkedSampleIds.has(snapshot.id),
          ),
        ]
      : own;

    return visible
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
      .map(WorkoutTemplate.fromSnapshot);
  }

  async findVisible(
    userId: string,
    templateId: string,
  ): Promise<WorkoutTemplate | null> {
    const snapshot = this.byId.get(templateId);
    if (!snapshot) return null;
    const visible = snapshot.userId === userId || snapshot.userId === null;
    return visible ? WorkoutTemplate.fromSnapshot(snapshot) : null;
  }

  async findForkOf(
    userId: string,
    sampleId: string,
  ): Promise<WorkoutTemplate | null> {
    const snapshot = [...this.byId.values()].find(
      (candidate) =>
        candidate.userId === userId && candidate.forkedFromId === sampleId,
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
}
