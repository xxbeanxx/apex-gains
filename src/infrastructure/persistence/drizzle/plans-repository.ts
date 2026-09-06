import { type SQL, and, asc, desc, eq, inArray } from 'drizzle-orm';

import type { PlanName, PlansRepository } from '~application/ports/persistence/plans-repository';
import { Plan } from '~domain/plan/plan';
import { LibraryVisibility } from '~domain/shared/ownership';
import { dbScope } from '~infrastructure/persistence/drizzle/index';
import {
  type Plan as PlanRow,
  type PlanSlot as PlanSlotRow,
  planSlots,
  plans,
} from '~infrastructure/persistence/drizzle/schema';

import { diffChildren } from '../shared/diff-children';
import { writePositions } from '../shared/write-positions';
import { visibleRowWhere, visibleRowsWhere } from './shared/visibility';

/** The columns `shared/visibility.ts` reads to build this table's clauses. */
const visibility = {
  table: plans,
  id: plans.id,
  userId: plans.userId,
  forkedFromId: plans.forkedFromId,
};

type RowWithSlots = PlanRow & { slots: PlanSlotRow[] };

function toPlan(row: RowWithSlots): Plan {
  return Plan.fromSnapshot({
    id: row.id,
    userId: row.userId,
    forkedFromId: row.forkedFromId,
    name: row.name,
    isActive: row.isActive,
    anchorDate: row.anchorDate,
    shareToken: row.shareToken,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    slots: row.slots.map((slot) => ({
      id: slot.id,
      position: slot.position,
      workoutId: slot.workoutId,
    })),
  });
}

export class DrizzlePlansRepository implements PlansRepository {
  async listFor(userId: string, showSampleData: boolean): Promise<Plan[]> {
    const rows = await dbScope.query.plans.findMany({
      where: visibleRowsWhere(visibility, LibraryVisibility.for(userId, showSampleData)),
      orderBy: desc(plans.updatedAt),
      with: { slots: { orderBy: asc(planSlots.position) } },
    });
    return rows.map(toPlan);
  }

  /** Two columns, no child join - see the port for why this exists. */
  async listNamesFor(userId: string, showSampleData: boolean): Promise<PlanName[]> {
    return dbScope
      .select({ id: plans.id, name: plans.name })
      .from(plans)
      .where(visibleRowsWhere(visibility, LibraryVisibility.for(userId, showSampleData)))
      .orderBy(desc(plans.updatedAt));
  }

  async findVisible(userId: string, planId: string): Promise<Plan | null> {
    const row = await dbScope.query.plans.findFirst({
      where: visibleRowWhere(visibility, userId, planId),
      with: { slots: { orderBy: asc(planSlots.position) } },
    });
    return row ? toPlan(row) : null;
  }

  async findActive(userId: string): Promise<Plan | null> {
    const row = await dbScope.query.plans.findFirst({
      where: and(eq(plans.userId, userId), eq(plans.isActive, true)),
      with: { slots: { orderBy: asc(planSlots.position) } },
    });
    return row ? toPlan(row) : null;
  }

  async findByShareToken(shareToken: string): Promise<Plan | null> {
    const row = await dbScope.query.plans.findFirst({
      where: eq(plans.shareToken, shareToken),
      with: { slots: { orderBy: asc(planSlots.position) } },
    });
    return row ? toPlan(row) : null;
  }

  async findForkOf(userId: string, sampleId: string): Promise<Plan | null> {
    const row = await dbScope.query.plans.findFirst({
      where: and(eq(plans.userId, userId), eq(plans.forkedFromId, sampleId)),
      with: { slots: { orderBy: asc(planSlots.position) } },
    });
    return row ? toPlan(row) : null;
  }

  /**
   * Writes the plan and its slots as one unit. Same ordering constraint
   * as workouts - delete, then reposition through scratch values, then
   * insert - see DrizzleWorkoutsRepository.save for why.
   */
  async save(plan: Plan): Promise<void> {
    const snapshot = plan.toSnapshot();

    await dbScope
      .insert(plans)
      .values({
        id: snapshot.id,
        userId: snapshot.userId,
        forkedFromId: snapshot.forkedFromId,
        name: snapshot.name,
        isActive: snapshot.isActive,
        anchorDate: snapshot.anchorDate,
        shareToken: snapshot.shareToken,
        createdAt: snapshot.createdAt,
        updatedAt: snapshot.updatedAt,
      })
      .onConflictDoUpdate({
        target: plans.id,
        set: {
          name: snapshot.name,
          isActive: snapshot.isActive,
          anchorDate: snapshot.anchorDate,
          shareToken: snapshot.shareToken,
          updatedAt: snapshot.updatedAt,
        },
      });

    const existing = await dbScope.select().from(planSlots).where(eq(planSlots.planId, snapshot.id));

    const diff = diffChildren(existing, snapshot.slots);

    if (diff.deletedIds.length > 0) {
      await dbScope.delete(planSlots).where(inArray(planSlots.id, diff.deletedIds));
    }

    for (const slot of diff.updated) {
      await dbScope.update(planSlots).set({ workoutId: slot.workoutId }).where(eq(planSlots.id, slot.id));
    }

    await writePositions(new Map(existing.map((row) => [row.id, row.position])), diff.updated, (id, position) =>
      dbScope.update(planSlots).set({ position }).where(eq(planSlots.id, id)),
    );

    if (diff.inserted.length > 0) {
      await dbScope.insert(planSlots).values(
        diff.inserted.map((slot) => ({
          id: slot.id,
          planId: snapshot.id,
          position: slot.position,
          workoutId: slot.workoutId,
        })),
      );
    }
  }

  async delete(planId: string): Promise<void> {
    await dbScope.delete(plans).where(eq(plans.id, planId));
  }
}
