ALTER TABLE "exercises" DROP CONSTRAINT "exercises_name_unique";--> statement-breakpoint
ALTER TABLE "routines" ALTER COLUMN "user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "templates" ALTER COLUMN "user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "equipment" ADD COLUMN "user_id" uuid;--> statement-breakpoint
ALTER TABLE "exercises" ADD COLUMN "user_id" uuid;--> statement-breakpoint
ALTER TABLE "exercises" ADD COLUMN "forked_from_id" uuid;--> statement-breakpoint
ALTER TABLE "routines" ADD COLUMN "forked_from_id" uuid;--> statement-breakpoint
ALTER TABLE "templates" ADD COLUMN "forked_from_id" uuid;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "show_sample_data" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "equipment" ADD CONSTRAINT "equipment_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exercises" ADD CONSTRAINT "exercises_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exercises" ADD CONSTRAINT "exercises_forked_from_id_exercises_id_fk" FOREIGN KEY ("forked_from_id") REFERENCES "public"."exercises"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routines" ADD CONSTRAINT "routines_forked_from_id_routines_id_fk" FOREIGN KEY ("forked_from_id") REFERENCES "public"."routines"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "templates" ADD CONSTRAINT "templates_forked_from_id_templates_id_fk" FOREIGN KEY ("forked_from_id") REFERENCES "public"."templates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "exercises_sample_name_unique" ON "exercises" USING btree ("name") WHERE "exercises"."user_id" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "routines_sample_name_unique" ON "routines" USING btree ("name") WHERE "routines"."user_id" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "templates_sample_name_unique" ON "templates" USING btree ("name") WHERE "templates"."user_id" is null;--> statement-breakpoint
ALTER TABLE "exercises" ADD CONSTRAINT "exercises_user_name_unique" UNIQUE("user_id","name");--> statement-breakpoint
-- `exercises`/`equipment` had no `user_id` column before this migration, so
-- every pre-existing row (both the seeded library and anything a user added
-- through the UI) just became NULL - indistinguishable from sample data.
-- The seeded rows are meant to stay NULL (they ARE the samples); anything
-- else was necessarily added by a real user through the app, which today
-- only ever has one account, so backfill those rows to that account rather
-- than leave them looking like - and gettable hidden as - sample data.
UPDATE "exercises" SET "user_id" = (SELECT "id" FROM "users" ORDER BY "created_at" ASC LIMIT 1)
WHERE "user_id" IS NULL AND "name" NOT IN (
  'Chest Press', 'Incline Chest Press', 'Chest Fly', 'Seated Row', 'Lat Pulldown',
  'Deadlift', 'Shoulder Press', 'Lateral Raise', 'Upright Row', 'Bicep Curl',
  'Tricep Pressdown', 'Leg Extension', 'Leg Curl', 'Leg Press', 'Squat',
  'Rowing', 'Treadmill Walk', 'Treadmill Run', 'Push-Up', 'Sit-Up', 'Plank',
  'Bodyweight Squat', 'Lunge'
);--> statement-breakpoint
UPDATE "equipment" SET "user_id" = (SELECT "id" FROM "users" ORDER BY "created_at" ASC LIMIT 1)
WHERE "user_id" IS NULL AND "name" NOT IN (
  'BowFlex PR1000', 'Rowing Machine', 'Treadmill', 'Bodyweight'
);