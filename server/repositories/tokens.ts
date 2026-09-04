/**
 * DI tokens for the repository ports under `app/repositories/*.server.ts`.
 * `repositories.module.ts` is the only place that decides which adapter
 * (Drizzle vs in-memory) backs each one; everything else - services, and
 * the couple of routes/middleware that touch `AthletesRepository` directly
 * - depends on the token, never on a concrete adapter class.
 */
export const ATHLETES_REPOSITORY = Symbol("ATHLETES_REPOSITORY");
export const BODY_WEIGHT_REPOSITORY = Symbol("BODY_WEIGHT_REPOSITORY");
export const EQUIPMENT_REPOSITORY = Symbol("EQUIPMENT_REPOSITORY");
export const EXERCISES_REPOSITORY = Symbol("EXERCISES_REPOSITORY");
export const ROUTINES_REPOSITORY = Symbol("ROUTINES_REPOSITORY");
export const TEMPLATES_REPOSITORY = Symbol("TEMPLATES_REPOSITORY");
export const WORKOUT_SESSIONS_REPOSITORY = Symbol(
  "WORKOUT_SESSIONS_REPOSITORY",
);
export const UNIT_OF_WORK = Symbol("UNIT_OF_WORK");
