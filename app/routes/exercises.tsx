import { asc } from "drizzle-orm";

import { Badge } from "~/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { db } from "~/db/index.server";
import { exercises } from "~/db/schema";

import type { Route } from "./+types/exercises";

export function meta() {
  return [{ title: "Exercises - Apex Gains" }];
}

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
  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-bold">Exercise Library</h1>
      <div className="mt-6 overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Equipment</TableHead>
              <TableHead>Muscle Group</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loaderData.exercises.map((exercise) => (
              <TableRow key={exercise.id}>
                <TableCell className="font-medium">
                  {exercise.name}
                </TableCell>
                <TableCell>
                  <Badge variant="secondary">{exercise.exerciseType}</Badge>
                </TableCell>
                <TableCell>
                  {equipmentLabels[exercise.equipment] ?? exercise.equipment}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {exercise.muscleGroup ?? "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </main>
  );
}
