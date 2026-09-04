import { and, eq, inArray, isNull, sql } from 'drizzle-orm';

import { db } from './index.server';
import { equipment, exerciseEquipment, exercises, routineSlots, routines, templateExercises, templates } from './schema';

const equipmentNames = ['BowFlex PR1000', 'Rowing Machine', 'Treadmill', 'Bodyweight'] as const;

/**
 * Which cardio field applies on each piece of equipment - null for the
 * BowFlex (used for both strength work and resistance-only rowing, so no
 * single kind fits) and for Bodyweight (not cardio equipment at all).
 */
const cardioKindByEquipmentName: Record<(typeof equipmentNames)[number], 'speed' | 'resistance' | null> = {
  'BowFlex PR1000': null,
  'Rowing Machine': 'resistance',
  Treadmill: 'speed',
  Bodyweight: null,
};

type SeedExercise = typeof exercises.$inferInsert & {
  equipment: (typeof equipmentNames)[number][];
};

const seedExercises: SeedExercise[] = [
  // BowFlex PR1000
  {
    name: 'Aerobic Rowing',
    exerciseType: 'cardio',
    equipment: ['BowFlex PR1000'],
    muscleGroup: 'chest',
    description: 'Push the handles away from your chest and return at a brisk, continuous pace to build cardio endurance.',
  },
  {
    name: 'Bench Press',
    exerciseType: 'strength',
    equipment: ['BowFlex PR1000'],
    muscleGroup: 'chest',
    description: 'Press the handles forward from chest height until your arms are extended, then return with control.',
  },
  {
    name: 'Decline Bench Press',
    exerciseType: 'strength',
    equipment: ['BowFlex PR1000'],
    muscleGroup: 'chest',
    description: 'Press the handles down and forward from a declined angle until your arms extend, then return with control.',
  },
  {
    name: 'Incline Bench Press',
    exerciseType: 'strength',
    equipment: ['BowFlex PR1000'],
    muscleGroup: 'chest',
    description: 'Press the handles upward and forward from an inclined angle to emphasize the upper chest.',
  },
  {
    name: 'Chest Fly',
    exerciseType: 'strength',
    equipment: ['BowFlex PR1000'],
    muscleGroup: 'chest',
    description: 'With arms slightly bent, bring the handles together in a wide arcing motion in front of your chest.',
  },
  {
    name: 'Seated Shoulder Press',
    exerciseType: 'strength',
    equipment: ['BowFlex PR1000'],
    muscleGroup: 'shoulders',
    description: 'Press the handles straight overhead from shoulder height, then lower with control.',
  },
  {
    name: 'Front Shoulder Raise',
    exerciseType: 'strength',
    equipment: ['BowFlex PR1000'],
    muscleGroup: 'shoulders',
    description: 'Raise the handles forward to shoulder height with arms extended, then lower with control.',
  },
  {
    name: 'Lateral Raise',
    exerciseType: 'strength',
    equipment: ['BowFlex PR1000'],
    muscleGroup: 'shoulders',
    description: 'Raise the handles out to your sides until your arms are roughly parallel to the floor.',
  },
  {
    name: 'Crossover Seated Rear Deltoid Rows',
    exerciseType: 'strength',
    equipment: ['BowFlex PR1000'],
    muscleGroup: 'shoulders',
    description: 'Pull the crossed cables back and apart toward your sides, squeezing your shoulder blades together.',
  },
  {
    name: 'Scapular Retraction',
    exerciseType: 'strength',
    equipment: ['BowFlex PR1000'],
    muscleGroup: 'shoulders',
    description: 'Without bending your arms, pull your shoulder blades together and back, then release with control.',
  },
  {
    name: 'Upright Row',
    exerciseType: 'strength',
    equipment: ['BowFlex PR1000'],
    muscleGroup: 'shoulders',
    description: 'Pull the handles straight up along your body toward chin height, leading with your elbows.',
  },
  {
    name: 'Seated Lat Rows',
    exerciseType: 'strength',
    equipment: ['BowFlex PR1000'],
    muscleGroup: 'back',
    description:
      'Pull the handles toward your torso while keeping your back straight, squeezing your shoulder blades together.',
  },
  {
    name: 'Narrow Pulldowns',
    exerciseType: 'strength',
    equipment: ['BowFlex PR1000'],
    muscleGroup: 'back',
    description: 'Pull the bar down toward your upper chest, then extend back up with control.',
  },
  {
    name: 'Stiff Arm Pulldowns',
    exerciseType: 'strength',
    equipment: ['BowFlex PR1000'],
    muscleGroup: 'back',
    description: 'With arms straight, pull the bar down toward your thighs using your lats, then return with control.',
  },
  {
    name: 'Reverse Grip Pulldown',
    exerciseType: 'strength',
    equipment: ['BowFlex PR1000'],
    muscleGroup: 'back',
    description: 'Using an underhand grip, pull the handles down toward your chest, then extend back up with control.',
  },
  {
    name: 'Seated Low Back Extension',
    exerciseType: 'strength',
    equipment: ['BowFlex PR1000'],
    muscleGroup: 'back',
    description:
      'With arms crossed and the hand grips looped over your forearms, pivot at the torso to pull back against the resistance, then return with control.',
  },
  {
    name: 'Deadlift',
    exerciseType: 'strength',
    equipment: ['BowFlex PR1000'],
    muscleGroup: 'back',
    description: 'Hinge at the hips to lower the handles toward the floor, then drive through your hips to stand back up.',
  },
  {
    name: 'Standing Biceps Curl',
    exerciseType: 'strength',
    equipment: ['BowFlex PR1000'],
    muscleGroup: 'arms',
    description: 'Curl the weight up toward your shoulders, keeping elbows tucked at your sides.',
  },
  {
    name: 'Triceps Pushdown',
    exerciseType: 'strength',
    equipment: ['BowFlex PR1000'],
    muscleGroup: 'arms',
    description: 'Extend your arms downward against the resistance, keeping elbows close to your body.',
  },
  {
    name: 'Lying Triceps Extension',
    exerciseType: 'strength',
    equipment: ['BowFlex PR1000'],
    muscleGroup: 'arms',
    description: 'Lying on the bench, extend your arms from a bent position until straight, then lower with control.',
  },
  {
    name: 'Standing Wrist Curl',
    exerciseType: 'strength',
    equipment: ['BowFlex PR1000'],
    muscleGroup: 'arms',
    description: 'Keeping your forearms still, curl your wrists up against the resistance, then lower with control.',
  },
  {
    name: 'Seated Abdominal Crunch',
    exerciseType: 'strength',
    equipment: ['BowFlex PR1000'],
    muscleGroup: 'core',
    description: 'Curl your torso forward against the resistance, then return to the starting position with control.',
  },
  {
    name: 'Trunk Rotation',
    exerciseType: 'strength',
    equipment: ['BowFlex PR1000'],
    muscleGroup: 'core',
    description: 'Keeping your hips still, rotate your torso against the resistance, then return with control.',
  },
  {
    name: 'Leg Extension',
    exerciseType: 'strength',
    equipment: ['BowFlex PR1000'],
    muscleGroup: 'legs',
    description: "Extend your legs forward against the resistance until they're straight, then lower with control.",
  },
  {
    name: 'Leg Curl',
    exerciseType: 'strength',
    equipment: ['BowFlex PR1000'],
    muscleGroup: 'legs',
    description: 'Curl your heels toward your glutes against the resistance, then extend back out.',
  },
  {
    name: 'Leg Press',
    exerciseType: 'strength',
    equipment: ['BowFlex PR1000'],
    muscleGroup: 'legs',
    description: 'Push the platform away by extending your legs, then return with control without locking your knees.',
  },
  {
    name: 'Calf Raise',
    exerciseType: 'strength',
    equipment: ['BowFlex PR1000'],
    muscleGroup: 'legs',
    description: 'Push through the balls of your feet to extend your ankles against the resistance, then lower with control.',
  },
  {
    name: 'Seated Hip Adduction',
    exerciseType: 'strength',
    equipment: ['BowFlex PR1000'],
    muscleGroup: 'legs',
    description: 'Pull your leg inward across your body against the resistance, then return with control.',
  },
  {
    name: 'Seated Hip Abduction',
    exerciseType: 'strength',
    equipment: ['BowFlex PR1000'],
    muscleGroup: 'legs',
    description: 'Push your leg outward away from your body against the resistance, then return with control.',
  },
  {
    name: 'Standing Leg Kickback',
    exerciseType: 'strength',
    equipment: ['BowFlex PR1000'],
    muscleGroup: 'legs',
    description:
      'Holding the lat tower for support, extend one leg straight back against the resistance, then return with control.',
  },
  {
    name: 'Squat',
    exerciseType: 'strength',
    equipment: ['BowFlex PR1000'],
    muscleGroup: 'legs',
    description: 'Using the cable resistance for support, bend your knees and hips to lower into a squat, then stand back up.',
  },

  // Rowing machine
  {
    name: 'Rowing',
    exerciseType: 'cardio',
    equipment: ['Rowing Machine'],
    muscleGroup: null,
    description: 'Drive with your legs, lean back, then pull the handle to your torso; reverse the motion to return.',
  },

  // Treadmill
  {
    name: 'Treadmill Walk',
    exerciseType: 'cardio',
    equipment: ['Treadmill'],
    muscleGroup: null,
    description: 'Walk at a steady pace, keeping an upright posture.',
  },
  {
    name: 'Treadmill Run',
    exerciseType: 'cardio',
    equipment: ['Treadmill'],
    muscleGroup: null,
    description: 'Run at a steady or varied pace, landing lightly with each stride.',
  },

  // Bodyweight
  {
    name: 'Push-Up',
    exerciseType: 'strength',
    equipment: ['Bodyweight'],
    muscleGroup: 'chest',
    description: 'Lower your chest toward the floor by bending your elbows, then push back up to full extension.',
  },
  {
    name: 'Sit-Up',
    exerciseType: 'strength',
    equipment: ['Bodyweight'],
    muscleGroup: 'core',
    description: 'Curl your torso up toward your knees, then lower back down with control.',
  },
  {
    name: 'Plank',
    exerciseType: 'strength',
    equipment: ['Bodyweight'],
    muscleGroup: 'core',
    description: 'Hold a straight-line position on your forearms and toes, keeping your core braced.',
  },
  {
    name: 'Bodyweight Squat',
    exerciseType: 'strength',
    equipment: ['Bodyweight'],
    muscleGroup: 'legs',
    description: 'Bend your knees and hips to lower your hips back and down, then stand back up.',
  },
  {
    name: 'Lunge',
    exerciseType: 'strength',
    equipment: ['Bodyweight'],
    muscleGroup: 'legs',
    description: 'Step forward and lower your back knee toward the floor, then push back to standing.',
  },
];

type SeedTemplateExercise = {
  exerciseName: (typeof seedExercises)[number]['name'];
  targetSets?: number;
  targetReps?: number;
  targetDurationSeconds?: number;
  targetSpeed?: string;
  targetResistance?: number;
};

const seedTemplates: { name: string; exercises: SeedTemplateExercise[] }[] = [
  {
    name: 'Push Day',
    exercises: [
      { exerciseName: 'Bench Press', targetSets: 3, targetReps: 10 },
      { exerciseName: 'Incline Bench Press', targetSets: 3, targetReps: 10 },
      { exerciseName: 'Seated Shoulder Press', targetSets: 3, targetReps: 10 },
      { exerciseName: 'Triceps Pushdown', targetSets: 3, targetReps: 12 },
    ],
  },
  {
    name: 'Pull Day',
    exercises: [
      { exerciseName: 'Seated Lat Rows', targetSets: 3, targetReps: 10 },
      { exerciseName: 'Narrow Pulldowns', targetSets: 3, targetReps: 10 },
      { exerciseName: 'Standing Biceps Curl', targetSets: 3, targetReps: 12 },
      { exerciseName: 'Upright Row', targetSets: 3, targetReps: 10 },
    ],
  },
  {
    name: 'Leg Day',
    exercises: [
      { exerciseName: 'Squat', targetSets: 3, targetReps: 10 },
      { exerciseName: 'Leg Press', targetSets: 3, targetReps: 10 },
      { exerciseName: 'Leg Extension', targetSets: 3, targetReps: 12 },
      { exerciseName: 'Leg Curl', targetSets: 3, targetReps: 12 },
    ],
  },
  {
    name: 'Easy Row',
    exercises: [
      {
        exerciseName: 'Rowing',
        targetDurationSeconds: 20 * 60,
        targetResistance: 4,
      },
    ],
  },
  {
    name: 'Treadmill Intervals',
    exercises: [
      {
        exerciseName: 'Treadmill Run',
        targetDurationSeconds: 20 * 60,
        targetSpeed: '6.0',
      },
    ],
  },
];

// null = a rest day. A fixed placeholder anchor date is fine since this
// sample routine is never activated directly - only a user's fork (created
// on the "activate" action) gets reanchored, via the existing Anchor date
// form.
const seedRoutine = {
  name: 'Push/Pull/Legs + Cardio',
  anchorDate: '2024-01-01',
  days: ['Push Day', 'Pull Day', 'Leg Day', 'Easy Row', null] as (string | null)[],
};

async function seed() {
  await db
    .insert(equipment)
    .values(equipmentNames.map((name) => ({ name, cardioKind: cardioKindByEquipmentName[name] })))
    .onConflictDoUpdate({
      target: equipment.name,
      set: { cardioKind: sql`excluded.cardio_kind` },
    });

  const equipmentRows = await db.select().from(equipment).where(inArray(equipment.name, equipmentNames));
  const equipmentIdByName = new Map(equipmentRows.map((e) => [e.name, e.id]));

  // Fills in name/type/muscle group/description for the seeded exercises,
  // without clobbering a description a user has since edited via the UI.
  const exerciseRows = await db
    .insert(exercises)
    .values(seedExercises.map(({ equipment: _equipment, ...rest }) => rest))
    .onConflictDoUpdate({
      target: exercises.name,
      targetWhere: sql`${exercises.userId} is null`,
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

  // Sample templates/routine. Idempotent by name (scoped to sample rows via
  // the partial unique indexes on schema.ts) - once a template/routine has
  // its child rows populated, later reseeds leave it alone rather than
  // fighting with a user's fork or overwriting seed content in place.
  await db
    .insert(templates)
    .values(seedTemplates.map((t) => ({ userId: null, name: t.name })))
    .onConflictDoNothing({
      target: templates.name,
      where: sql`${templates.userId} is null`,
    });

  const templateRows = await db.query.templates.findMany({
    where: and(
      isNull(templates.userId),
      inArray(
        templates.name,
        seedTemplates.map((t) => t.name),
      ),
    ),
    with: { templateExercises: true },
  });
  const templateRowByName = new Map(templateRows.map((t) => [t.name, t]));

  for (const seedTemplate of seedTemplates) {
    const templateRow = templateRowByName.get(seedTemplate.name);
    if (!templateRow || templateRow.templateExercises.length > 0) continue;

    await db.insert(templateExercises).values(
      seedTemplate.exercises.map((te, position) => ({
        templateId: templateRow.id,
        exerciseId: exerciseIdByName.get(te.exerciseName)!,
        position,
        targetSets: te.targetSets ?? null,
        targetReps: te.targetReps ?? null,
        targetDurationSeconds: te.targetDurationSeconds ?? null,
        targetSpeed: te.targetSpeed ?? null,
        targetResistance: te.targetResistance ?? null,
      })),
    );
  }

  await db
    .insert(routines)
    .values({
      userId: null,
      name: seedRoutine.name,
      anchorDate: seedRoutine.anchorDate,
    })
    .onConflictDoNothing({
      target: routines.name,
      where: sql`${routines.userId} is null`,
    });

  const routineRow = await db.query.routines.findFirst({
    where: and(isNull(routines.userId), eq(routines.name, seedRoutine.name)),
    with: { slots: true },
  });

  if (routineRow && routineRow.slots.length === 0) {
    await db.insert(routineSlots).values(
      seedRoutine.days.map((templateName, position) => ({
        routineId: routineRow.id,
        position,
        templateId: templateName === null ? null : (templateRowByName.get(templateName)?.id ?? null),
      })),
    );
  }

  console.log(
    `Seeded/updated ${exerciseRows.length} exercise(s), linked to ${equipmentRows.length} equipment, ${templateRows.length} sample template(s), and 1 sample routine.`,
  );
  process.exit(0);
}

seed().catch((error) => {
  console.error(error);
  process.exit(1);
});
