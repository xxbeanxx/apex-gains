CREATE TYPE "public"."muscle_group" AS ENUM('Chest', 'Back', 'Traps', 'Shoulders', 'Biceps', 'Triceps', 'Forearms', 'Core', 'Quadriceps', 'Hamstrings', 'Glutes', 'Calves', 'Full Body');--> statement-breakpoint
-- muscle_group used to be freeform text, with only six values in practice:
-- chest, shoulders, back, arms, core, legs. chest/shoulders/back/core map
-- onto the new enum one-for-one - just a case fix. arms and legs each
-- covered several of the new, more specific groups, so those are resolved
-- per exercise by name against the same split the seed data now uses.
-- Anything that still doesn't match a known value afterward (a custom entry
-- typed through the old free-text field) becomes null rather than fail the
-- type change with a guess.
UPDATE "exercises" SET "muscle_group" = CASE lower(trim("muscle_group"))
  WHEN 'chest' THEN 'Chest'
  WHEN 'back' THEN 'Back'
  WHEN 'shoulders' THEN 'Shoulders'
  WHEN 'core' THEN 'Core'
  ELSE "muscle_group"
END
WHERE lower(trim("muscle_group")) IN ('chest', 'back', 'shoulders', 'core');--> statement-breakpoint

UPDATE "exercises" SET "muscle_group" = CASE "name"
  WHEN 'Standing Biceps Curl' THEN 'Biceps'
  WHEN 'Triceps Pushdown' THEN 'Triceps'
  WHEN 'Lying Triceps Extension' THEN 'Triceps'
  WHEN 'Standing Wrist Curl' THEN 'Forearms'
  ELSE NULL
END
WHERE lower(trim("muscle_group")) = 'arms';--> statement-breakpoint

UPDATE "exercises" SET "muscle_group" = CASE "name"
  WHEN 'Leg Extension' THEN 'Quadriceps'
  WHEN 'Leg Press' THEN 'Quadriceps'
  WHEN 'Squat' THEN 'Quadriceps'
  WHEN 'Bodyweight Squat' THEN 'Quadriceps'
  WHEN 'Leg Curl' THEN 'Hamstrings'
  WHEN 'Calf Raise' THEN 'Calves'
  WHEN 'Seated Hip Adduction' THEN 'Glutes'
  WHEN 'Seated Hip Abduction' THEN 'Glutes'
  WHEN 'Standing Leg Kickback' THEN 'Glutes'
  WHEN 'Lunge' THEN 'Glutes'
  ELSE NULL
END
WHERE lower(trim("muscle_group")) = 'legs';--> statement-breakpoint

UPDATE "exercises" SET "muscle_group" = NULL
WHERE "muscle_group" IS NOT NULL
  AND "muscle_group" NOT IN ('Chest', 'Back', 'Traps', 'Shoulders', 'Biceps', 'Triceps', 'Forearms', 'Core', 'Quadriceps', 'Hamstrings', 'Glutes', 'Calves', 'Full Body');--> statement-breakpoint

ALTER TABLE "exercises" ALTER COLUMN "muscle_group" SET DATA TYPE "public"."muscle_group" USING "muscle_group"::"public"."muscle_group";
