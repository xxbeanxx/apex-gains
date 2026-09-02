import { inArray } from "drizzle-orm";

import { db } from "./index.server";
import { equipment, exerciseEquipment, exercises } from "./schema";

const equipmentNames = [
  "BowFlex PR1000",
  "Rowing Machine",
  "Treadmill",
  "Bodyweight",
] as const;

type SeedExercise = typeof exercises.$inferInsert & {
  equipment: (typeof equipmentNames)[number][];
};

const seedExercises: SeedExercise[] = [
  // BowFlex PR1000
  { name: "Chest Press", exerciseType: "strength", equipment: ["BowFlex PR1000"], muscleGroup: "chest" },
  { name: "Incline Chest Press", exerciseType: "strength", equipment: ["BowFlex PR1000"], muscleGroup: "chest" },
  { name: "Chest Fly", exerciseType: "strength", equipment: ["BowFlex PR1000"], muscleGroup: "chest" },
  { name: "Seated Row", exerciseType: "strength", equipment: ["BowFlex PR1000"], muscleGroup: "back" },
  { name: "Lat Pulldown", exerciseType: "strength", equipment: ["BowFlex PR1000"], muscleGroup: "back" },
  { name: "Deadlift", exerciseType: "strength", equipment: ["BowFlex PR1000"], muscleGroup: "back" },
  { name: "Shoulder Press", exerciseType: "strength", equipment: ["BowFlex PR1000"], muscleGroup: "shoulders" },
  { name: "Lateral Raise", exerciseType: "strength", equipment: ["BowFlex PR1000"], muscleGroup: "shoulders" },
  { name: "Upright Row", exerciseType: "strength", equipment: ["BowFlex PR1000"], muscleGroup: "shoulders" },
  { name: "Bicep Curl", exerciseType: "strength", equipment: ["BowFlex PR1000"], muscleGroup: "arms" },
  { name: "Tricep Pressdown", exerciseType: "strength", equipment: ["BowFlex PR1000"], muscleGroup: "arms" },
  { name: "Leg Extension", exerciseType: "strength", equipment: ["BowFlex PR1000"], muscleGroup: "legs" },
  { name: "Leg Curl", exerciseType: "strength", equipment: ["BowFlex PR1000"], muscleGroup: "legs" },
  { name: "Leg Press", exerciseType: "strength", equipment: ["BowFlex PR1000"], muscleGroup: "legs" },
  { name: "Squat", exerciseType: "strength", equipment: ["BowFlex PR1000"], muscleGroup: "legs" },

  // Rowing machine
  { name: "Rowing", exerciseType: "cardio", equipment: ["Rowing Machine"], muscleGroup: null },

  // Treadmill
  { name: "Treadmill Walk", exerciseType: "cardio", equipment: ["Treadmill"], muscleGroup: null },
  { name: "Treadmill Run", exerciseType: "cardio", equipment: ["Treadmill"], muscleGroup: null },

  // Bodyweight
  { name: "Push-Up", exerciseType: "strength", equipment: ["Bodyweight"], muscleGroup: "chest" },
  { name: "Sit-Up", exerciseType: "strength", equipment: ["Bodyweight"], muscleGroup: "core" },
  { name: "Plank", exerciseType: "strength", equipment: ["Bodyweight"], muscleGroup: "core" },
  { name: "Bodyweight Squat", exerciseType: "strength", equipment: ["Bodyweight"], muscleGroup: "legs" },
  { name: "Lunge", exerciseType: "strength", equipment: ["Bodyweight"], muscleGroup: "legs" },
];

async function seed() {
  await db
    .insert(equipment)
    .values(equipmentNames.map((name) => ({ name })))
    .onConflictDoNothing({ target: equipment.name });

  const equipmentRows = await db
    .select()
    .from(equipment)
    .where(inArray(equipment.name, equipmentNames));
  const equipmentIdByName = new Map(equipmentRows.map((e) => [e.name, e.id]));

  const exerciseRows = await db
    .insert(exercises)
    .values(
      seedExercises.map(({ equipment: _equipment, ...rest }) => rest),
    )
    .onConflictDoNothing({ target: exercises.name })
    .returning({ id: exercises.id, name: exercises.name });

  const allExerciseRows =
    exerciseRows.length === seedExercises.length
      ? exerciseRows
      : await db
          .select({ id: exercises.id, name: exercises.name })
          .from(exercises)
          .where(
            inArray(
              exercises.name,
              seedExercises.map((e) => e.name),
            ),
          );
  const exerciseIdByName = new Map(allExerciseRows.map((e) => [e.name, e.id]));

  const links = seedExercises.flatMap((seedExercise) => {
    const exerciseId = exerciseIdByName.get(seedExercise.name);
    if (!exerciseId) return [];
    return seedExercise.equipment.map((equipmentName) => ({
      exerciseId,
      equipmentId: equipmentIdByName.get(equipmentName)!,
    }));
  });

  if (links.length > 0) {
    await db
      .insert(exerciseEquipment)
      .values(links)
      .onConflictDoNothing({
        target: [exerciseEquipment.exerciseId, exerciseEquipment.equipmentId],
      });
  }

  console.log(
    `Seeded ${exerciseRows.length} new exercise(s) (${seedExercises.length} in seed list), linked to ${equipmentRows.length} equipment.`,
  );
  process.exit(0);
}

seed().catch((error) => {
  console.error(error);
  process.exit(1);
});
