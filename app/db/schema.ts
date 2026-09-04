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

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  googleSub: text('google_sub').notNull().unique(),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  avatarUrl: text('avatar_url'),
  weightUnit: weightUnitEnum('weight_unit').notNull().default('lb'),
  distanceUnit: distanceUnitEnum('distance_unit').notNull().default('km'),
  showSampleData: boolean('show_sample_data').notNull().default(true),
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

export const templates = pgTable(
  'templates',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').references(() => users.id, {
      onDelete: 'cascade',
    }),
    forkedFromId: uuid('forked_from_id').references((): AnyPgColumn => templates.id, { onDelete: 'set null' }),
    name: text('name').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('templates_sample_name_unique')
      .on(table.name)
      .where(sql`${table.userId} is null`),
  ],
);

export const templateExercises = pgTable(
  'template_exercises',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    templateId: uuid('template_id')
      .notNull()
      .references(() => templates.id, { onDelete: 'cascade' }),
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
  },
  (table) => [unique('template_exercises_template_position_unique').on(table.templateId, table.position)],
);

export const routines = pgTable(
  'routines',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').references(() => users.id, {
      onDelete: 'cascade',
    }),
    forkedFromId: uuid('forked_from_id').references((): AnyPgColumn => routines.id, { onDelete: 'set null' }),
    name: text('name').notNull(),
    isActive: boolean('is_active').notNull().default(false),
    anchorDate: date('anchor_date').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('routines_one_active_per_user')
      .on(table.userId)
      .where(sql`${table.isActive} = true`),
    uniqueIndex('routines_sample_name_unique')
      .on(table.name)
      .where(sql`${table.userId} is null`),
  ],
);

export const routineSlots = pgTable(
  'routine_slots',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    routineId: uuid('routine_id')
      .notNull()
      .references(() => routines.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
    templateId: uuid('template_id').references(() => templates.id, {
      onDelete: 'set null',
    }),
  },
  (table) => [unique('routine_slots_routine_position_unique').on(table.routineId, table.position)],
);

export const workoutSessions = pgTable(
  'workout_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    date: date('date').notNull(),
    routineId: uuid('routine_id').references(() => routines.id, {
      onDelete: 'set null',
    }),
    templateId: uuid('template_id').references(() => templates.id, {
      onDelete: 'set null',
    }),
    isRestDay: boolean('is_rest_day').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique('workout_sessions_user_date_unique').on(table.userId, table.date)],
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
    .references(() => workoutSessions.id, { onDelete: 'cascade' }),
  exerciseId: uuid('exercise_id')
    .notNull()
    .references(() => exercises.id, { onDelete: 'restrict' }),
  setNumber: integer('set_number').notNull(),
  reps: integer('reps'),
  weight: numeric('weight', { precision: 6, scale: 2 }),
  durationSeconds: integer('duration_seconds'),
  speed: numeric('speed', { precision: 5, scale: 2 }),
  resistanceLevel: integer('resistance_level'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const usersRelations = relations(users, ({ many }) => ({
  templates: many(templates),
  routines: many(routines),
  workoutSessions: many(workoutSessions),
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
  templateExercises: many(templateExercises),
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

export const templatesRelations = relations(templates, ({ one, many }) => ({
  user: one(users, {
    fields: [templates.userId],
    references: [users.id],
  }),
  forkedFrom: one(templates, {
    fields: [templates.forkedFromId],
    references: [templates.id],
    relationName: 'templateFork',
  }),
  forks: many(templates, { relationName: 'templateFork' }),
  templateExercises: many(templateExercises),
  routineSlots: many(routineSlots),
}));

export const templateExercisesRelations = relations(templateExercises, ({ one }) => ({
  template: one(templates, {
    fields: [templateExercises.templateId],
    references: [templates.id],
  }),
  exercise: one(exercises, {
    fields: [templateExercises.exerciseId],
    references: [exercises.id],
  }),
}));

export const routinesRelations = relations(routines, ({ one, many }) => ({
  user: one(users, {
    fields: [routines.userId],
    references: [users.id],
  }),
  forkedFrom: one(routines, {
    fields: [routines.forkedFromId],
    references: [routines.id],
    relationName: 'routineFork',
  }),
  forks: many(routines, { relationName: 'routineFork' }),
  slots: many(routineSlots),
}));

export const routineSlotsRelations = relations(routineSlots, ({ one }) => ({
  routine: one(routines, {
    fields: [routineSlots.routineId],
    references: [routines.id],
  }),
  template: one(templates, {
    fields: [routineSlots.templateId],
    references: [templates.id],
  }),
}));

export const workoutSessionsRelations = relations(workoutSessions, ({ one, many }) => ({
  user: one(users, {
    fields: [workoutSessions.userId],
    references: [users.id],
  }),
  routine: one(routines, {
    fields: [workoutSessions.routineId],
    references: [routines.id],
  }),
  template: one(templates, {
    fields: [workoutSessions.templateId],
    references: [templates.id],
  }),
  sets: many(sessionSets),
}));

export const sessionSetsRelations = relations(sessionSets, ({ one }) => ({
  session: one(workoutSessions, {
    fields: [sessionSets.sessionId],
    references: [workoutSessions.id],
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
export type Template = typeof templates.$inferSelect;
export type TemplateExercise = typeof templateExercises.$inferSelect;
export type Routine = typeof routines.$inferSelect;
export type RoutineSlot = typeof routineSlots.$inferSelect;
export type WorkoutSession = typeof workoutSessions.$inferSelect;
export type SessionSet = typeof sessionSets.$inferSelect;
export type BodyWeightLog = typeof bodyWeightLogs.$inferSelect;
