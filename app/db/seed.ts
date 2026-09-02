import { db } from "./index.server";
import { exercises } from "./schema";

type SeedExercise = typeof exercises.$inferInsert;

const seedExercises: SeedExercise[] = [
  // BowFlex PR1000
  { name: "Chest Press", exerciseType: "strength", equipment: "bowflex_pr1000", muscleGroup: "chest" },
  { name: "Incline Chest Press", exerciseType: "strength", equipment: "bowflex_pr1000", muscleGroup: "chest" },
  { name: "Chest Fly", exerciseType: "strength", equipment: "bowflex_pr1000", muscleGroup: "chest" },
  { name: "Seated Row", exerciseType: "strength", equipment: "bowflex_pr1000", muscleGroup: "back" },
  { name: "Lat Pulldown", exerciseType: "strength", equipment: "bowflex_pr1000", muscleGroup: "back" },
  { name: "Deadlift", exerciseType: "strength", equipment: "bowflex_pr1000", muscleGroup: "back" },
  { name: "Shoulder Press", exerciseType: "strength", equipment: "bowflex_pr1000", muscleGroup: "shoulders" },
  { name: "Lateral Raise", exerciseType: "strength", equipment: "bowflex_pr1000", muscleGroup: "shoulders" },
  { name: "Upright Row", exerciseType: "strength", equipment: "bowflex_pr1000", muscleGroup: "shoulders" },
  { name: "Bicep Curl", exerciseType: "strength", equipment: "bowflex_pr1000", muscleGroup: "arms" },
  { name: "Tricep Pressdown", exerciseType: "strength", equipment: "bowflex_pr1000", muscleGroup: "arms" },
  { name: "Leg Extension", exerciseType: "strength", equipment: "bowflex_pr1000", muscleGroup: "legs" },
  { name: "Leg Curl", exerciseType: "strength", equipment: "bowflex_pr1000", muscleGroup: "legs" },
  { name: "Leg Press", exerciseType: "strength", equipment: "bowflex_pr1000", muscleGroup: "legs" },
  { name: "Squat", exerciseType: "strength", equipment: "bowflex_pr1000", muscleGroup: "legs" },

  // Rowing machine
  { name: "Rowing", exerciseType: "cardio", equipment: "rowing_machine", muscleGroup: null },

  // Treadmill
  { name: "Treadmill Walk", exerciseType: "cardio", equipment: "treadmill", muscleGroup: null },
  { name: "Treadmill Run", exerciseType: "cardio", equipment: "treadmill", muscleGroup: null },

  // Bodyweight
  { name: "Push-Up", exerciseType: "strength", equipment: "bodyweight", muscleGroup: "chest" },
  { name: "Sit-Up", exerciseType: "strength", equipment: "bodyweight", muscleGroup: "core" },
  { name: "Plank", exerciseType: "strength", equipment: "bodyweight", muscleGroup: "core" },
  { name: "Bodyweight Squat", exerciseType: "strength", equipment: "bodyweight", muscleGroup: "legs" },
  { name: "Lunge", exerciseType: "strength", equipment: "bodyweight", muscleGroup: "legs" },
];

async function seed() {
  const rows = await db
    .insert(exercises)
    .values(seedExercises)
    .onConflictDoNothing({ target: exercises.name })
    .returning({ name: exercises.name });

  console.log(`Seeded ${rows.length} new exercise(s) (${seedExercises.length} in seed list).`);
  process.exit(0);
}

seed().catch((error) => {
  console.error(error);
  process.exit(1);
});
