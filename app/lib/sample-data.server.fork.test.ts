import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Exercise, Routine, RoutineSlot, Template, TemplateExercise } from "~/db/schema";
import { dbChain } from "~/test/db-chain";
import { mock } from "~/test/mock";

import {
  forkExerciseForUser,
  forkRoutineForUser,
  forkTemplateForUser,
} from "./sample-data.server";

type ExerciseTx = Parameters<typeof forkExerciseForUser>[0];
type TemplateTx = Parameters<typeof forkTemplateForUser>[0];
type RoutineTx = Parameters<typeof forkRoutineForUser>[0];

function exerciseTx(opts: {
  existingFork?: Exercise | undefined;
  links?: { equipmentId: string }[];
  insert: ReturnType<typeof vi.fn>;
}): ExerciseTx {
  return mock<ExerciseTx>({
    query: mock<ExerciseTx["query"]>({
      exercises: mock<ExerciseTx["query"]["exercises"]>({
        findFirst: vi.fn().mockResolvedValue(opts.existingFork),
      }),
      exerciseEquipment: mock<ExerciseTx["query"]["exerciseEquipment"]>({
        findMany: vi.fn().mockResolvedValue(opts.links ?? []),
      }),
    }),
    insert: opts.insert,
  });
}

describe("forkExerciseForUser", () => {
  const sample = mock<Exercise>({
    id: "sample-exercise-1",
    name: "Bench Press",
    exerciseType: "strength",
    muscleGroup: "chest",
    description: null,
  });

  it("returns the existing fork without inserting anything", async () => {
    const existingFork = mock<Exercise>({ id: "fork-1" });
    const insert = vi.fn();
    const tx = exerciseTx({ existingFork, insert });

    const result = await forkExerciseForUser(tx, sample, "user-1");

    expect(result).toBe(existingFork);
    expect(insert).not.toHaveBeenCalled();
  });

  it("creates a fork and skips the equipment-links insert when there are none", async () => {
    const fork = mock<Exercise>({ id: "fork-1" });
    const insert = vi.fn().mockReturnValueOnce(dbChain([fork]));
    const tx = exerciseTx({ existingFork: undefined, links: [], insert });

    const result = await forkExerciseForUser(tx, sample, "user-1");

    expect(result).toBe(fork);
    expect(insert).toHaveBeenCalledTimes(1);
  });

  it("creates a fork and copies equipment links from the sample", async () => {
    const fork = mock<Exercise>({ id: "fork-1" });
    const insert = vi
      .fn()
      .mockReturnValueOnce(dbChain([fork]))
      .mockReturnValueOnce(dbChain(undefined));
    const tx = exerciseTx({
      existingFork: undefined,
      links: [{ equipmentId: "equip-1" }, { equipmentId: "equip-2" }],
      insert,
    });

    const result = await forkExerciseForUser(tx, sample, "user-1");

    expect(result).toBe(fork);
    expect(insert).toHaveBeenCalledTimes(2);
  });
});

function templateTx(opts: {
  existingFork?: (Template & { templateExercises: TemplateExercise[] }) | undefined;
  insert: ReturnType<typeof vi.fn>;
}): TemplateTx {
  return mock<TemplateTx>({
    query: mock<TemplateTx["query"]>({
      templates: mock<TemplateTx["query"]["templates"]>({
        findFirst: vi.fn().mockResolvedValue(opts.existingFork),
      }),
    }),
    insert: opts.insert,
  });
}

describe("forkTemplateForUser", () => {
  const sample = mock<Template & { templateExercises: TemplateExercise[] }>({
    id: "sample-template-1",
    name: "Push Day",
    templateExercises: [
      mock<TemplateExercise>({ id: "te-2", exerciseId: "ex-2", position: 1 }),
      mock<TemplateExercise>({ id: "te-1", exerciseId: "ex-1", position: 0 }),
    ],
  });

  it("returns the existing fork and its exercises without inserting", async () => {
    const existingFork = mock<
      Template & { templateExercises: TemplateExercise[] }
    >({ id: "fork-1", templateExercises: [] });
    const insert = vi.fn();
    const tx = templateTx({ existingFork, insert });

    const result = await forkTemplateForUser(tx, sample, "user-1");

    expect(result).toEqual({
      fork: existingFork,
      forkedTemplateExercises: [],
    });
    expect(insert).not.toHaveBeenCalled();
  });

  it("creates a fork and copies template exercises in position order", async () => {
    const fork = mock<Template>({ id: "fork-1" });
    const forkedExercises = [
      mock<TemplateExercise>({ id: "new-te-1", position: 0 }),
      mock<TemplateExercise>({ id: "new-te-2", position: 1 }),
    ];
    const insert = vi
      .fn()
      .mockReturnValueOnce(dbChain([fork]))
      .mockReturnValueOnce(dbChain(forkedExercises));
    const tx = templateTx({ existingFork: undefined, insert });

    const result = await forkTemplateForUser(tx, sample, "user-1");

    expect(result).toEqual({ fork, forkedTemplateExercises: forkedExercises });
    expect(insert).toHaveBeenCalledTimes(2);
  });

  it("skips the template-exercises insert when the sample has none", async () => {
    const emptySample = mock<
      Template & { templateExercises: TemplateExercise[] }
    >({ id: "sample-template-2", templateExercises: [] });
    const fork = mock<Template>({ id: "fork-1" });
    const insert = vi.fn().mockReturnValueOnce(dbChain([fork]));
    const tx = templateTx({ existingFork: undefined, insert });

    const result = await forkTemplateForUser(tx, emptySample, "user-1");

    expect(result).toEqual({ fork, forkedTemplateExercises: [] });
    expect(insert).toHaveBeenCalledTimes(1);
  });
});

function routineTx(opts: {
  existingFork?: (Routine & { slots: RoutineSlot[] }) | undefined;
  insert: ReturnType<typeof vi.fn>;
}): RoutineTx {
  return mock<RoutineTx>({
    query: mock<RoutineTx["query"]>({
      routines: mock<RoutineTx["query"]["routines"]>({
        findFirst: vi.fn().mockResolvedValue(opts.existingFork),
      }),
    }),
    insert: opts.insert,
  });
}

describe("forkRoutineForUser", () => {
  const sample = mock<Routine & { slots: RoutineSlot[] }>({
    id: "sample-routine-1",
    name: "PPL",
    anchorDate: "2026-09-01",
    slots: [
      mock<RoutineSlot>({ id: "slot-2", position: 1, templateId: null }),
      mock<RoutineSlot>({ id: "slot-1", position: 0, templateId: "t-1" }),
    ],
  });

  it("returns the existing fork and its slots without inserting", async () => {
    const existingFork = mock<Routine & { slots: RoutineSlot[] }>({
      id: "fork-1",
      slots: [],
    });
    const insert = vi.fn();
    const tx = routineTx({ existingFork, insert });

    const result = await forkRoutineForUser(tx, sample, "user-1");

    expect(result).toEqual({ fork: existingFork, forkedSlots: [] });
    expect(insert).not.toHaveBeenCalled();
  });

  it("creates a fork and copies slots in position order", async () => {
    const fork = mock<Routine>({ id: "fork-1" });
    const forkedSlots = [
      mock<RoutineSlot>({ id: "new-slot-1", position: 0 }),
      mock<RoutineSlot>({ id: "new-slot-2", position: 1 }),
    ];
    const insert = vi
      .fn()
      .mockReturnValueOnce(dbChain([fork]))
      .mockReturnValueOnce(dbChain(forkedSlots));
    const tx = routineTx({ existingFork: undefined, insert });

    const result = await forkRoutineForUser(tx, sample, "user-1");

    expect(result).toEqual({ fork, forkedSlots });
    expect(insert).toHaveBeenCalledTimes(2);
  });

  it("skips the slots insert when the sample routine has none", async () => {
    const emptySample = mock<Routine & { slots: RoutineSlot[] }>({
      id: "sample-routine-2",
      slots: [],
    });
    const fork = mock<Routine>({ id: "fork-1" });
    const insert = vi.fn().mockReturnValueOnce(dbChain([fork]));
    const tx = routineTx({ existingFork: undefined, insert });

    const result = await forkRoutineForUser(tx, emptySample, "user-1");

    expect(result).toEqual({ fork, forkedSlots: [] });
    expect(insert).toHaveBeenCalledTimes(1);
  });
});
