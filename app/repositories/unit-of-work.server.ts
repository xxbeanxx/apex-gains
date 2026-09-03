import type { UnitOfWork } from "./unit-of-work";

let unitOfWork: UnitOfWork | undefined;

// Same selection rule and the same reason for the dynamic imports as the
// repositories - see athletes-repository.server.ts.
export async function getUnitOfWork(): Promise<UnitOfWork> {
  if (!unitOfWork) {
    unitOfWork = process.env.DATABASE_URL
      ? new (
          await import("./drizzle/unit-of-work.drizzle.server")
        ).DrizzleUnitOfWork()
      : new (
          await import("./in-memory/unit-of-work.in-memory.server")
        ).InMemoryUnitOfWork();
  }
  return unitOfWork;
}
