import { desc, eq } from "drizzle-orm";

import { userContext } from "~/auth/user-context";
import { Badge } from "~/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { db } from "~/db/index.server";
import { workoutSessions } from "~/db/schema";

import type { Route } from "./+types/history";

export function meta() {
  return [{ title: "History - Apex Gains" }];
}

function setSummary(set: {
  reps: number | null;
  weight: string | null;
  durationSeconds: number | null;
  speed: string | null;
  resistanceLevel: number | null;
}) {
  const parts: string[] = [];
  if (set.weight && set.reps) parts.push(`${set.weight} lb x ${set.reps}`);
  else if (set.reps) parts.push(`${set.reps} reps`);
  if (set.durationSeconds) {
    parts.push(`${Math.round(set.durationSeconds / 60)} min`);
  }
  if (set.speed) parts.push(`${set.speed} speed`);
  if (set.resistanceLevel) parts.push(`resistance ${set.resistanceLevel}`);
  return parts.join(", ");
}

export async function loader({ context }: Route.LoaderArgs) {
  const user = context.get(userContext)!;
  const sessions = await db.query.workoutSessions.findMany({
    where: eq(workoutSessions.userId, user.id),
    orderBy: desc(workoutSessions.date),
    limit: 90,
    with: {
      sets: {
        with: { exercise: true },
        orderBy: (s, { asc }) => asc(s.createdAt),
      },
    },
  });
  return { sessions };
}

export default function History({ loaderData }: Route.ComponentProps) {
  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="text-2xl font-bold">History</h1>

      <div className="mt-6 flex flex-col gap-4">
        {loaderData.sessions.map((session) => {
          const setsByExercise = new Map<string, typeof session.sets>();
          for (const set of session.sets) {
            const list = setsByExercise.get(set.exerciseId) ?? [];
            list.push(set);
            setsByExercise.set(set.exerciseId, list);
          }

          return (
            <Card key={session.id}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  {session.date}
                  {session.isRestDay && session.sets.length === 0 ? (
                    <Badge variant="secondary">Rest</Badge>
                  ) : null}
                </CardTitle>
              </CardHeader>
              {setsByExercise.size > 0 ? (
                <CardContent className="flex flex-col gap-2">
                  {[...setsByExercise.entries()].map(([exerciseId, sets]) => (
                    <div key={exerciseId}>
                      <p className="font-medium">{sets[0].exercise.name}</p>
                      <p className="text-muted-foreground text-sm">
                        {sets.map((s) => setSummary(s)).join(" | ")}
                      </p>
                    </div>
                  ))}
                </CardContent>
              ) : null}
            </Card>
          );
        })}
        {loaderData.sessions.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No history yet. Log a workout on the Today page.
          </p>
        ) : null}
      </div>
    </main>
  );
}
