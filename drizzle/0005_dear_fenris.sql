CREATE TYPE "public"."cardio_kind" AS ENUM('speed', 'resistance');--> statement-breakpoint
ALTER TABLE "equipment" ADD COLUMN "cardio_kind" "cardio_kind";