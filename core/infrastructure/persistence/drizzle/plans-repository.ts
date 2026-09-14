import { and, desc, asc, eq } from 'drizzle-orm';
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
import { visibleRowWhere, visibleRowsWhere } from '~infrastructure/persistence/drizzle/shared/visibility';
import { type OrderedChildColumns, saveOrderedChildren } from '~infrastructure/persistence/shared/save-ordered-children';

/**
 * The columns `shared/visibility.ts` reads to build this table's clauses.
 */
const visibility = {
  table: plans,
  id: plans.id,
  userId: plans.userId,
  forkedFromId: plans.forkedFromId,
};

/**
 * The columns `shared/save-ordered-children.ts` needs for `plan_slots`.
 */
const slotColumns: OrderedChildColumns = {
  table: planSlots,
  id: planSlots.id,
  parentId: planSlots.planId,
  parentIdKey: 'planId',
  position: planSlots.position,
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

  /**
   * Two columns, no child join - see the port for why this exists.
   */
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
   * Writes the plan and its slots as one unit - see
   * `shared/save-ordered-children.ts` for the slot-ordering sequence.
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

    await saveOrderedChildren(slotColumns, snapshot.id, snapshot.slots, (slot) => ({
      workoutId: slot.workoutId,
    }));
  }

  async delete(planId: string): Promise<void> {
    await dbScope.delete(plans).where(eq(plans.id, planId));
  }
}
