/**
 * DI tokens for the repository ports in this directory.
 *
 * They live in the composition root rather than beside the ports, because
 * nothing in `src/application` is Nest-aware: a use case takes its ports as
 * plain constructor parameters and `server/services/services.module.ts`
 * supplies them through an explicit factory. Binding a token to a concrete
 * adapter (Drizzle vs in-memory) is the composition root's job too, and
 * happens in exactly one place: `server/repositories/repositories.module.ts`.
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
