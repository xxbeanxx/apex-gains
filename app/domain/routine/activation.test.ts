import { describe, expect, it } from "vitest";

import { activateRoutine } from "./activation";
import { Routine, type RoutineSnapshot } from "./routine";

const NOW = new Date("2026-09-03T12:00:00Z");

function routine(id: string, isActive = false): Routine {
  const snapshot: RoutineSnapshot = {
    id,
    userId: "user-1",
    forkedFromId: null,
    name: id,
    isActive,
    anchorDate: "2026-09-01",
    createdAt: NOW,
    updatedAt: NOW,
    slots: [],
  };
  return Routine.fromSnapshot(snapshot);
}

describe("activateRoutine", () => {
  it("activates a routine when nothing is active yet", () => {
    const target = routine("a");

    const changed = activateRoutine(target, null, NOW);

    expect(target.isActive).toBe(true);
    expect(changed).toEqual([target]);
  });

  /**
   * The whole reason this is a domain service rather than a method: only one
   * routine per athlete may be active, and no single routine can enforce
   * that on its own.
   */
  it("stands down the previously active routine", () => {
    const target = routine("a");
    const previous = routine("b", true);

    const changed = activateRoutine(target, previous, NOW);

    expect(previous.isActive).toBe(false);
    expect(target.isActive).toBe(true);
    // Both changed, so both must be saved - in one transaction, since the
    // schema refuses two active rows for one athlete.
    expect(changed).toEqual([previous, target]);
  });

  it("is idempotent when the target is already the active one", () => {
    const target = routine("a", true);

    const changed = activateRoutine(target, target, NOW);

    expect(target.isActive).toBe(true);
    expect(changed).toEqual([target]);
  });

  it("stamps the routines it changed", () => {
    const target = routine("a");
    const later = new Date("2026-09-04T08:00:00Z");

    activateRoutine(target, null, later);

    expect(target.updatedAt).toEqual(later);
  });
});
