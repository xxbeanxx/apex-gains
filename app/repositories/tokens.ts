/**
 * DI tokens for the repository ports in this directory.
 *
 * They live beside the ports they name, not in the composition root, so that
 * `app/services` can depend on a port's token without importing from
 * `server/`. Binding a token to a concrete adapter (Drizzle vs in-memory) is
 * the composition root's job and happens in exactly one place:
 * `server/repositories/repositories.module.ts`.
 */
export const ADMIN_ACTIONS_REPOSITORY = Symbol('ADMIN_ACTIONS_REPOSITORY');
export const ATHLETES_REPOSITORY = Symbol('ATHLETES_REPOSITORY');
export const BODY_MEASUREMENTS_REPOSITORY = Symbol('BODY_MEASUREMENTS_REPOSITORY');
export const BODY_WEIGHT_REPOSITORY = Symbol('BODY_WEIGHT_REPOSITORY');
export const EQUIPMENT_REPOSITORY = Symbol('EQUIPMENT_REPOSITORY');
export const EXERCISES_REPOSITORY = Symbol('EXERCISES_REPOSITORY');
export const PLANS_REPOSITORY = Symbol('PLANS_REPOSITORY');
export const WORKOUTS_REPOSITORY = Symbol('WORKOUTS_REPOSITORY');
export const SESSIONS_REPOSITORY = Symbol('SESSIONS_REPOSITORY');
export const UNIT_OF_WORK = Symbol('UNIT_OF_WORK');
