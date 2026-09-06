import { relations, sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  boolean,
  date,
  integer,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

export const weightUnitEnum = pgEnum('weight_unit', ['lb', 'kg']);
export const distanceUnitEnum = pgEnum('distance_unit', ['km', 'mi']);
export const exerciseTypeEnum = pgEnum('exercise_type', ['strength', 'cardio']);
export const cardioKindEnum = pgEnum('cardio_kind', ['speed', 'resistance']);

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  googleSub: text('google_sub').notNull().unique(),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  avatarUrl: text('avatar_url'),
  weightUnit: weightUnitEnum('weight_unit').notNull().default('lb'),
  distanceUnit: distanceUnitEnum('distance_unit').notNull().default('km'),
  showSampleData: boolean('show_sample_data').notNull().default(true),
  timezone: text('timezone').notNull().default('UTC'),
  defaultRestSeconds: integer('default_rest_seconds'),
  isAdmin: boolean('is_admin').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const exercises = pgTable(
  'exercises',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').references(() => users.id, {
      onDelete: 'cascade',
    }),
    forkedFromId: uuid('forked_from_id').references((): AnyPgColumn => exercises.id, { onDelete: 'set null' }),
    name: text('name').notNull(),
    exerciseType: exerciseTypeEnum('exercise_type').notNull(),
    muscleGroup: text('muscle_group'),
    description: text('description'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('exercises_sample_name_unique')
      .on(table.name)
      .where(sql`${table.userId} is null`),
    unique('exercises_user_name_unique').on(table.userId, table.name),
  ],
);

export const equipment = pgTable('equipment', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull().unique(),
  cardioKind: cardioKindEnum('cardio_kind'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const exerciseEquipment = pgTable(
  'exercise_equipment',
  {
    exerciseId: uuid('exercise_id')
      .notNull()
      .references(() => exercises.id, { onDelete: 'cascade' }),
    equipmentId: uuid('equipment_id')
      .notNull()
      .references(() => equipment.id, { onDelete: 'cascade' }),
  },
  (table) => [primaryKey({ columns: [table.exerciseId, table.equipmentId] })],
);

export const workouts = pgTable(
  'workouts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').references(() => users.id, {
      onDelete: 'cascade',
    }),
    forkedFromId: uuid('forked_from_id').references((): AnyPgColumn => workouts.id, { onDelete: 'set null' }),
    name: text('name').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('workouts_sample_name_unique')
      .on(table.name)
      .where(sql`${table.userId} is null`),
  ],
);

export const workoutExercises = pgTable(
  'workout_exercises',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workoutId: uuid('workout_id')
      .notNull()
      .references(() => workouts.id, { onDelete: 'cascade' }),
    exerciseId: uuid('exercise_id')
      .notNull()
      .references(() => exercises.id, { onDelete: 'restrict' }),
    position: integer('position').notNull(),
    targetSets: integer('target_sets'),
    targetReps: integer('target_reps'),
    targetWeight: numeric('target_weight', { precision: 6, scale: 2 }),
    targetDurationSeconds: integer('target_duration_seconds'),
    targetSpeed: numeric('target_speed', { precision: 5, scale: 2 }),
    targetResistance: integer('target_resistance'),
    targetRestSeconds: integer('rest_seconds'),
  },
  (table) => [unique('workout_exercises_workout_position_unique').on(table.workoutId, table.position)],
);

export const plans = pgTable(
  'plans',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').references(() => users.id, {
      onDelete: 'cascade',
    }),
    forkedFromId: uuid('forked_from_id').references((): AnyPgColumn => plans.id, { onDelete: 'set null' }),
    name: text('name').notNull(),
    isActive: boolean('is_active').notNull().default(false),
    anchorDate: date('anchor_date').notNull(),
    /**
     * Minted on demand so a plan can be handed to someone else by link or
     * QR code, and cleared to revoke it. Unique across the table because it
     * is looked up on its own, without a `userId` to scope it - the token is
     * the whole of the authorization to import.
     */
    shareToken: text('share_token').unique(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('plans_one_active_per_user')
      .on(table.userId)
      .where(sql`${table.isActive} = true`),
    uniqueIndex('plans_sample_name_unique')
      .on(table.name)
      .where(sql`${table.userId} is null`),
  ],
);

export const planSlots = pgTable(
  'plan_slots',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    planId: uuid('plan_id')
      .notNull()
      .references(() => plans.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
    workoutId: uuid('workout_id').references(() => workouts.id, {
      onDelete: 'set null',
    }),
  },
  (table) => [unique('plan_slots_plan_position_unique').on(table.planId, table.position)],
);

export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    date: date('date').notNull(),
    planId: uuid('plan_id').references(() => plans.id, {
      onDelete: 'set null',
    }),
    workoutId: uuid('workout_id').references(() => workouts.id, {
      onDelete: 'set null',
    }),
    isRestDay: boolean('is_rest_day').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique('sessions_user_date_unique').on(table.userId, table.date)],
);

export const bodyWeightLogs = pgTable(
  'body_weight_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    date: date('date').notNull(),
    weight: numeric('weight', { precision: 6, scale: 2 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique('body_weight_logs_user_date_unique').on(table.userId, table.date)],
);

export const sessionSets = pgTable('session_sets', {
  id: uuid('id').primaryKey().defaultRandom(),
  sessionId: uuid('session_id')
    .notNull()
    .references(() => sessions.id, { onDelete: 'cascade' }),
  exerciseId: uuid('exercise_id')
    .notNull()
    .references(() => exercises.id, { onDelete: 'restrict' }),
  setNumber: integer('set_number').notNull(),
  reps: integer('reps'),
  weight: numeric('weight', { precision: 6, scale: 2 }),
  durationSeconds: integer('duration_seconds'),
  speed: numeric('speed', { precision: 5, scale: 2 }),
  resistanceLevel: integer('resistance_level'),
  notes: text('notes'),
  rpe: numeric('rpe', { precision: 3, scale: 1 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Append-only: an administrator granting or revoking access, or deleting an
 * account. `actorId`/`targetId` are `on delete set null`, never cascade -
 * deleting an account must not erase the record of who deleted it, or of
 * having been deleted. The matching `*Email` columns are denormalised
 * alongside each id for exactly that reason: the row they name can later be
 * gone, and the log still has to say who it was.
 */
export const adminActions = pgTable('admin_actions', {
  id: uuid('id').primaryKey().defaultRandom(),
  actorId: uuid('actor_id').references(() => users.id, { onDelete: 'set null' }),
  actorEmail: text('actor_email').notNull(),
  targetId: uuid('target_id').references(() => users.id, { onDelete: 'set null' }),
  targetEmail: text('target_email').notNull(),
  action: text('action').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const usersRelations = relations(users, ({ many }) => ({
  workouts: many(workouts),
  plans: many(plans),
  sessions: many(sessions),
  bodyWeightLogs: many(bodyWeightLogs),
}));

export const exercisesRelations = relations(exercises, ({ one, many }) => ({
  user: one(users, {
    fields: [exercises.userId],
    references: [users.id],
  }),
  forkedFrom: one(exercises, {
    fields: [exercises.forkedFromId],
    references: [exercises.id],
    relationName: 'exerciseFork',
  }),
  forks: many(exercises, { relationName: 'exerciseFork' }),
  workoutExercises: many(workoutExercises),
  sessionSets: many(sessionSets),
  equipmentLinks: many(exerciseEquipment),
}));

export const equipmentRelations = relations(equipment, ({ one, many }) => ({
  user: one(users, {
    fields: [equipment.userId],
    references: [users.id],
  }),
  exerciseLinks: many(exerciseEquipment),
}));

export const exerciseEquipmentRelations = relations(exerciseEquipment, ({ one }) => ({
  exercise: one(exercises, {
    fields: [exerciseEquipment.exerciseId],
    references: [exercises.id],
  }),
  equipment: one(equipment, {
    fields: [exerciseEquipment.equipmentId],
    references: [equipment.id],
  }),
}));

export const workoutsRelations = relations(workouts, ({ one, many }) => ({
  user: one(users, {
    fields: [workouts.userId],
    references: [users.id],
  }),
  forkedFrom: one(workouts, {
    fields: [workouts.forkedFromId],
    references: [workouts.id],
    relationName: 'workoutFork',
  }),
  forks: many(workouts, { relationName: 'workoutFork' }),
  workoutExercises: many(workoutExercises),
  planSlots: many(planSlots),
}));

export const workoutExercisesRelations = relations(workoutExercises, ({ one }) => ({
  workout: one(workouts, {
    fields: [workoutExercises.workoutId],
    references: [workouts.id],
  }),
  exercise: one(exercises, {
    fields: [workoutExercises.exerciseId],
    references: [exercises.id],
  }),
}));

export const plansRelations = relations(plans, ({ one, many }) => ({
  user: one(users, {
    fields: [plans.userId],
    references: [users.id],
  }),
  forkedFrom: one(plans, {
    fields: [plans.forkedFromId],
    references: [plans.id],
    relationName: 'planFork',
  }),
  forks: many(plans, { relationName: 'planFork' }),
  slots: many(planSlots),
}));

export const planSlotsRelations = relations(planSlots, ({ one }) => ({
  plan: one(plans, {
    fields: [planSlots.planId],
    references: [plans.id],
  }),
  workout: one(workouts, {
    fields: [planSlots.workoutId],
    references: [workouts.id],
  }),
}));

export const sessionsRelations = relations(sessions, ({ one, many }) => ({
  user: one(users, {
    fields: [sessions.userId],
    references: [users.id],
  }),
  plan: one(plans, {
    fields: [sessions.planId],
    references: [plans.id],
  }),
  workout: one(workouts, {
    fields: [sessions.workoutId],
    references: [workouts.id],
  }),
  sets: many(sessionSets),
}));

export const sessionSetsRelations = relations(sessionSets, ({ one }) => ({
  session: one(sessions, {
    fields: [sessionSets.sessionId],
    references: [sessions.id],
  }),
  exercise: one(exercises, {
    fields: [sessionSets.exerciseId],
    references: [exercises.id],
  }),
}));

export const bodyWeightLogsRelations = relations(bodyWeightLogs, ({ one }) => ({
  user: one(users, {
    fields: [bodyWeightLogs.userId],
    references: [users.id],
  }),
}));

export type User = typeof users.$inferSelect;
export type Exercise = typeof exercises.$inferSelect;
export type Equipment = typeof equipment.$inferSelect;
export type Workout = typeof workouts.$inferSelect;
export type WorkoutExercise = typeof workoutExercises.$inferSelect;
export type Plan = typeof plans.$inferSelect;
export type PlanSlot = typeof planSlots.$inferSelect;
export type Session = typeof sessions.$inferSelect;
export type SessionSet = typeof sessionSets.$inferSelect;
export type BodyWeightLog = typeof bodyWeightLogs.$inferSelect;
export type AdminAction = typeof adminActions.$inferSelect;
