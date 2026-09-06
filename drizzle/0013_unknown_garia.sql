CREATE TYPE "public"."body_measurement_metric" AS ENUM('waist', 'chest', 'arm_left', 'arm_right', 'thigh', 'hips', 'neck');--> statement-breakpoint
CREATE TYPE "public"."length_unit" AS ENUM('cm', 'in');--> statement-breakpoint
CREATE TABLE "body_measurements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"date" date NOT NULL,
	"metric" "body_measurement_metric" NOT NULL,
	"value" numeric(6, 2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "body_measurements_user_date_metric_unique" UNIQUE("user_id","date","metric")
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "length_unit" "length_unit" DEFAULT 'in' NOT NULL;--> statement-breakpoint
ALTER TABLE "body_measurements" ADD CONSTRAINT "body_measurements_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
UPDATE "users" SET "length_unit" = 'cm' WHERE "distance_unit" = 'km';