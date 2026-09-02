import { inArray, sql } from "drizzle-orm";

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
  {
    name: "Chest Press",
    exerciseType: "strength",
    equipment: ["BowFlex PR1000"],
    muscleGroup: "chest",
    description:
      "Press the handles forward from chest height until your arms are extended, then return with control.",
  },
  {
    name: "Incline Chest Press",
    exerciseType: "strength",
    equipment: ["BowFlex PR1000"],
    muscleGroup: "chest",
    description:
      "Press the handles upward and forward from an inclined angle to emphasize the upper chest.",
  },
  {
    name: "Chest Fly",
    exerciseType: "strength",
    equipment: ["BowFlex PR1000"],
    muscleGroup: "chest",
    description:
      "With arms slightly bent, bring the handles together in a wide arcing motion in front of your chest.",
  },
  {
    name: "Seated Row",
    exerciseType: "strength",
    equipment: ["BowFlex PR1000"],
    muscleGroup: "back",
    description:
      "Pull the handles toward your torso while keeping your back straight, squeezing your shoulder blades together.",
  },
  {
    name: "Lat Pulldown",
    exerciseType: "strength",
    equipment: ["BowFlex PR1000"],
    muscleGroup: "back",
    description:
      "Pull the bar down toward your upper chest, then extend back up with control.",
  },
  {
    name: "Deadlift",
    exerciseType: "strength",
    equipment: ["BowFlex PR1000"],
    muscleGroup: "back",
    description:
      "Hinge at the hips to lower the handles toward the floor, then drive through your hips to stand back up.",
  },
  {
    name: "Shoulder Press",
    exerciseType: "strength",
    equipment: ["BowFlex PR1000"],
    muscleGroup: "shoulders",
    description:
      "Press the handles straight overhead from shoulder height, then lower with control.",
  },
  {
    name: "Lateral Raise",
    exerciseType: "strength",
    equipment: ["BowFlex PR1000"],
    muscleGroup: "shoulders",
    description:
      "Raise the handles out to your sides until your arms are roughly parallel to the floor.",
  },
  {
    name: "Upright Row",
    exerciseType: "strength",
    equipment: ["BowFlex PR1000"],
    muscleGroup: "shoulders",
    description:
      "Pull the handles straight up along your body toward chin height, leading with your elbows.",
  },
  {
    name: "Bicep Curl",
    exerciseType: "strength",
    equipment: ["BowFlex PR1000"],
    muscleGroup: "arms",
    description:
      "Curl the weight up toward your shoulders, keeping elbows tucked at your sides.",
  },
  {
    name: "Tricep Pressdown",
    exerciseType: "strength",
    equipment: ["BowFlex PR1000"],
    muscleGroup: "arms",
    description:
      "Extend your arms downward against the resistance, keeping elbows close to your body.",
  },
  {
    name: "Leg Extension",
    exerciseType: "strength",
    equipment: ["BowFlex PR1000"],
    muscleGroup: "legs",
    description:
      "Extend your legs forward against the resistance until they're straight, then lower with control.",
  },
  {
    name: "Leg Curl",
    exerciseType: "strength",
    equipment: ["BowFlex PR1000"],
    muscleGroup: "legs",
    description:
      "Curl your heels toward your glutes against the resistance, then extend back out.",
  },
  {
    name: "Leg Press",
    exerciseType: "strength",
    equipment: ["BowFlex PR1000"],
    muscleGroup: "legs",
    description:
      "Push the platform away by extending your legs, then return with control without locking your knees.",
  },
  {
    name: "Squat",
    exerciseType: "strength",
    equipment: ["BowFlex PR1000"],
    muscleGroup: "legs",
    description:
      "Using the cable resistance for support, bend your knees and hips to lower into a squat, then stand back up.",
  },

  // Rowing machine
  {
    name: "Rowing",
    exerciseType: "cardio",
    equipment: ["Rowing Machine"],
    muscleGroup: null,
    description:
      "Drive with your legs, lean back, then pull the handle to your torso; reverse the motion to return.",
  },

  // Treadmill
  {
    name: "Treadmill Walk",
    exerciseType: "cardio",
    equipment: ["Treadmill"],
    muscleGroup: null,
    description: "Walk at a steady pace, keeping an upright posture.",
  },
  {
    name: "Treadmill Run",
    exerciseType: "cardio",
    equipment: ["Treadmill"],
    muscleGroup: null,
    description: "Run at a steady or varied pace, landing lightly with each stride.",
  },

  // Bodyweight
  {
    name: "Push-Up",
    exerciseType: "strength",
    equipment: ["Bodyweight"],
    muscleGroup: "chest",
    description:
      "Lower your chest toward the floor by bending your elbows, then push back up to full extension.",
  },
  {
    name: "Sit-Up",
    exerciseType: "strength",
    equipment: ["Bodyweight"],
    muscleGroup: "core",
    description:
      "Curl your torso up toward your knees, then lower back down with control.",
  },
  {
    name: "Plank",
    exerciseType: "strength",
    equipment: ["Bodyweight"],
    muscleGroup: "core",
    description:
      "Hold a straight-line position on your forearms and toes, keeping your core braced.",
  },
  {
    name: "Bodyweight Squat",
    exerciseType: "strength",
    equipment: ["Bodyweight"],
    muscleGroup: "legs",
    description:
      "Bend your knees and hips to lower your hips back and down, then stand back up.",
  },
  {
    name: "Lunge",
    exerciseType: "strength",
    equipment: ["Bodyweight"],
    muscleGroup: "legs",
    description:
      "Step forward and lower your back knee toward the floor, then push back to standing.",
  },
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

  // Fills in name/type/muscle group/description for the seeded exercises,
  // without clobbering a description a user has since edited via the UI.
  const exerciseRows = await db
    .insert(exercises)
    .values(seedExercises.map(({ equipment: _equipment, ...rest }) => rest))
    .onConflictDoUpdate({
      target: exercises.name,
      set: {
        description: sql`coalesce(${exercises.description}, excluded.description)`,
      },
    })
    .returning({ id: exercises.id, name: exercises.name });
  const exerciseIdByName = new Map(exerciseRows.map((e) => [e.name, e.id]));

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
    `Seeded/updated ${exerciseRows.length} exercise(s), linked to ${equipmentRows.length} equipment.`,
  );
  process.exit(0);
}

seed().catch((error) => {
  console.error(error);
  process.exit(1);
});
