import type { UsersRepository } from "./users-repository";

let repository: UsersRepository | undefined;

// Ports and adapters: pick the adapter once per process and cache it, so
// the in-memory adapter's state actually persists across requests. The
// adapter modules are imported dynamically (rather than at the top of this
// file) so that importing this factory never pulls in ~/db/index.server -
// which throws at import time when DATABASE_URL is unset - unless a
// database is actually configured.
export async function getUsersRepository(): Promise<UsersRepository> {
  if (!repository) {
    repository = process.env.DATABASE_URL
      ? new (await import("./users-repository.drizzle.server")).DrizzleUsersRepository()
      : new (
          await import("./users-repository.in-memory.server")
        ).InMemoryUsersRepository();
  }
  return repository;
}
