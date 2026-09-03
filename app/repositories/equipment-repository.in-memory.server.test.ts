import { describe, expect, it } from "vitest";

import { InMemoryEquipmentRepository } from "./equipment-repository.in-memory.server";

describe("InMemoryEquipmentRepository", () => {
  it("returns an empty list and null findById when nothing exists", async () => {
    const repository = new InMemoryEquipmentRepository();

    expect(await repository.listForUser("user-1", true)).toEqual([]);
    expect(await repository.findById("missing")).toBeNull();
  });

  it("lists the user's own equipment plus sample equipment when showSampleData is true", async () => {
    const repository = new InMemoryEquipmentRepository();
    await repository.add("user-1", "Free Weights");
    await repository.add("user-2", "Kettlebell");

    const rows = await repository.listForUser("user-1", true);

    expect(rows.map((r) => r.name)).toEqual(["Free Weights"]);
  });

  it("excludes other users' equipment when showSampleData is false", async () => {
    const repository = new InMemoryEquipmentRepository();
    await repository.add("user-1", "Free Weights");

    const rows = await repository.listForUser("user-2", false);

    expect(rows).toEqual([]);
  });

  it("sorts by name", async () => {
    const repository = new InMemoryEquipmentRepository();
    await repository.add("user-1", "Treadmill");
    await repository.add("user-1", "Bike");

    const rows = await repository.listForUser("user-1", true);

    expect(rows.map((r) => r.name)).toEqual(["Bike", "Treadmill"]);
  });

  it("finds added equipment by id", async () => {
    const repository = new InMemoryEquipmentRepository();
    await repository.add("user-1", "Free Weights");
    const [added] = await repository.listForUser("user-1", true);

    expect(await repository.findById(added.id)).toEqual(added);
  });

  it("no-ops adding a name that's already taken by another user", async () => {
    const repository = new InMemoryEquipmentRepository();
    await repository.add("user-1", "Free Weights");
    await repository.add("user-2", "Free Weights");

    const rows = await repository.listForUser("user-2", true);

    expect(rows).toEqual([]);
  });

  it("only removes equipment owned by the requesting user", async () => {
    const repository = new InMemoryEquipmentRepository();
    await repository.add("user-1", "Free Weights");
    const [added] = await repository.listForUser("user-1", true);

    await repository.remove("user-2", added.id);
    expect(await repository.findById(added.id)).not.toBeNull();

    await repository.remove("user-1", added.id);
    expect(await repository.findById(added.id)).toBeNull();
  });
});
