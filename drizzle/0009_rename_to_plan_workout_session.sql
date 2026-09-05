ALTER TABLE "routine_slots" RENAME TO "plan_slots";--> statement-breakpoint
ALTER TABLE "routines" RENAME TO "plans";--> statement-breakpoint
ALTER TABLE "workout_sessions" RENAME TO "sessions";--> statement-breakpoint
ALTER TABLE "template_exercises" RENAME TO "workout_exercises";--> statement-breakpoint
ALTER TABLE "templates" RENAME TO "workouts";--> statement-breakpoint
ALTER TABLE "plan_slots" RENAME COLUMN "routine_id" TO "plan_id";--> statement-breakpoint
ALTER TABLE "plan_slots" RENAME COLUMN "template_id" TO "workout_id";--> statement-breakpoint
ALTER TABLE "workout_exercises" RENAME COLUMN "template_id" TO "workout_id";--> statement-breakpoint
ALTER TABLE "sessions" RENAME COLUMN "routine_id" TO "plan_id";--> statement-breakpoint
ALTER TABLE "sessions" RENAME COLUMN "template_id" TO "workout_id";--> statement-breakpoint
ALTER TABLE "plan_slots" RENAME CONSTRAINT "routine_slots_routine_position_unique" TO "plan_slots_plan_position_unique";--> statement-breakpoint
ALTER TABLE "plans" RENAME CONSTRAINT "routines_share_token_unique" TO "plans_share_token_unique";--> statement-breakpoint
ALTER TABLE "workout_exercises" RENAME CONSTRAINT "template_exercises_template_position_unique" TO "workout_exercises_workout_position_unique";--> statement-breakpoint
ALTER TABLE "sessions" RENAME CONSTRAINT "workout_sessions_user_date_unique" TO "sessions_user_date_unique";--> statement-breakpoint
ALTER TABLE "plan_slots" RENAME CONSTRAINT "routine_slots_routine_id_routines_id_fk" TO "plan_slots_plan_id_plans_id_fk";--> statement-breakpoint
ALTER TABLE "plan_slots" RENAME CONSTRAINT "routine_slots_template_id_templates_id_fk" TO "plan_slots_workout_id_workouts_id_fk";--> statement-breakpoint
ALTER TABLE "plans" RENAME CONSTRAINT "routines_user_id_users_id_fk" TO "plans_user_id_users_id_fk";--> statement-breakpoint
ALTER TABLE "plans" RENAME CONSTRAINT "routines_forked_from_id_routines_id_fk" TO "plans_forked_from_id_plans_id_fk";--> statement-breakpoint
ALTER TABLE "session_sets" RENAME CONSTRAINT "session_sets_session_id_workout_sessions_id_fk" TO "session_sets_session_id_sessions_id_fk";--> statement-breakpoint
ALTER TABLE "workout_exercises" RENAME CONSTRAINT "template_exercises_template_id_templates_id_fk" TO "workout_exercises_workout_id_workouts_id_fk";--> statement-breakpoint
ALTER TABLE "workout_exercises" RENAME CONSTRAINT "template_exercises_exercise_id_exercises_id_fk" TO "workout_exercises_exercise_id_exercises_id_fk";--> statement-breakpoint
ALTER TABLE "workouts" RENAME CONSTRAINT "templates_user_id_users_id_fk" TO "workouts_user_id_users_id_fk";--> statement-breakpoint
ALTER TABLE "workouts" RENAME CONSTRAINT "templates_forked_from_id_templates_id_fk" TO "workouts_forked_from_id_workouts_id_fk";--> statement-breakpoint
ALTER TABLE "sessions" RENAME CONSTRAINT "workout_sessions_user_id_users_id_fk" TO "sessions_user_id_users_id_fk";--> statement-breakpoint
ALTER TABLE "sessions" RENAME CONSTRAINT "workout_sessions_routine_id_routines_id_fk" TO "sessions_plan_id_plans_id_fk";--> statement-breakpoint
ALTER TABLE "sessions" RENAME CONSTRAINT "workout_sessions_template_id_templates_id_fk" TO "sessions_workout_id_workouts_id_fk";--> statement-breakpoint
ALTER INDEX "routines_one_active_per_user" RENAME TO "plans_one_active_per_user";--> statement-breakpoint
ALTER INDEX "routines_sample_name_unique" RENAME TO "plans_sample_name_unique";--> statement-breakpoint
ALTER INDEX "templates_sample_name_unique" RENAME TO "workouts_sample_name_unique";
