import { asc } from "drizzle-orm";

import { Badge } from "~/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { db } from "~/db/index.server";
import { type Exercise, exercises } from "~/db/schema";

import type { Route } from "./+types/exercises";

export function meta() {
  return [{ title: "Exercises - Apex Gains" }];
}

const equipmentOrder = [
  "bowflex_pr1000",
  "rowing_machine",
  "treadmill",
  "bodyweight",
] as const;

const equipmentLabels: Record<string, string> = {
  bowflex_pr1000: "BowFlex PR1000",
  rowing_machine: "Rowing Machine",
  treadmill: "Treadmill",
  bodyweight: "Bodyweight",
};

export async function loader() {
  const allExercises = await db
    .select()
    .from(exercises)
    .orderBy(asc(exercises.equipment), asc(exercises.name));
  return { exercises: allExercises };
}

export default function Exercises({ loaderData }: Route.ComponentProps) {
  const byEquipment = new Map<string, Exercise[]>();
  for (const exercise of loaderData.exercises) {
    const list = byEquipment.get(exercise.equipment) ?? [];
    list.push(exercise);
    byEquipment.set(exercise.equipment, list);
  }
  const equipmentGroups = equipmentOrder.filter((eq) => byEquipment.has(eq));

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="text-2xl font-bold">Exercise Library</h1>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {equipmentGroups.map((equipment) => {
          const list = byEquipment.get(equipment) ?? [];
          return (
            <Card key={equipment}>
              <CardHeader>
                <CardTitle className="text-base">
                  {equipmentLabels[equipment] ?? equipment}
                </CardTitle>
                <p className="text-muted-foreground text-sm">
                  {list.length} exercise{list.length === 1 ? "" : "s"}
                </p>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                {list.map((exercise) => (
                  <div key={exercise.id}>
                    <p className="font-medium">{exercise.name}</p>
                    <div className="mt-1 flex items-center gap-2">
                      <Badge variant="secondary" className="text-[10px]">
                        {exercise.exerciseType}
                      </Badge>
                      {exercise.muscleGroup ? (
                        <span className="text-muted-foreground text-xs">
                          {exercise.muscleGroup}
                        </span>
                      ) : null}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </main>
  );
}
