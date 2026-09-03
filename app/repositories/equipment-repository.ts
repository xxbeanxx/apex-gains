import type { Equipment } from "~/db/schema";

// Port: consumers depend on this interface, not on Drizzle/Postgres
// directly. See equipment-repository.server.ts for which adapter backs it
// at runtime.
export interface EquipmentRepository {
  listForUser(userId: string, showSampleData: boolean): Promise<Equipment[]>;
  findById(equipmentId: string): Promise<Equipment | null>;
  // No-ops silently on a name that's already taken (equipment names are
  // globally unique, not per-user) or on removing equipment the user
  // doesn't own - matches the route's current "just refresh the list"
  // behavior rather than surfacing an error for either case.
  add(userId: string, name: string): Promise<void>;
  remove(userId: string, equipmentId: string): Promise<void>;
}
