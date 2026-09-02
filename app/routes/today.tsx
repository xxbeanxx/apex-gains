import { and, asc, eq } from "drizzle-orm";
import { useState } from "react";
import { data, useFetcher } from "react-router";
import { z } from "zod";

import { userContext } from "~/auth/user-context";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { db } from "~/db/index.server";
import { type Exercise, exercises, sessionSets } from "~/db/schema";
import { todayDateString } from "~/lib/cycle";
import {
  getOrCreateSession,
  getTodaysPlan,
  type TodaysPlanItem,
} from "~/lib/todays-plan.server";

import type { Route } from "./+types/today";

export function meta() {
  return [{ title: "Today - Apex Gains" }];
}

function targetSummary(item: TodaysPlanItem) {
  const parts: string[] = [];
  if (item.targetSets && item.targetReps) {
    parts.push(`${item.targetSets} x ${item.targetReps}`);
  }
  if (item.targetWeight) parts.push(`${item.targetWeight} lb`);
  if (item.targetDurationSeconds) {
    parts.push(`${Math.round(item.targetDurationSeconds / 60)} min`);
  }
  if (item.targetSpeed) parts.push(`${item.targetSpeed} speed`);
  if (item.targetResistance) parts.push(`resistance ${item.targetResistance}`);
  return parts.length > 0 ? `Target: ${parts.join(", ")}` : null;
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
  const todayStr = todayDateString();
  const plan = await getTodaysPlan(user.id, todayStr);

  const session = await db.query.workoutSessions.findFirst({
    where: (ws, { and, eq }) =>
      and(eq(ws.userId, user.id), eq(ws.date, todayStr)),
    with: {
      sets: { with: { exercise: true }, orderBy: (s, { asc }) => asc(s.createdAt) },
    },
  });

  const allExercises = await db
    .select()
    .from(exercises)
    .orderBy(asc(exercises.equipment), asc(exercises.name));

  return {
    date: todayStr,
    plan,
    loggedSets: session?.sets ?? [],
    allExercises,
  };
}

const logSetSchema = z.object({
  exerciseId: z.uuid(),
  reps: z.coerce.number().int().positive().optional(),
  weight: z.coerce.number().positive().optional(),
  durationMinutes: z.coerce.number().positive().optional(),
  speed: z.coerce.number().positive().optional(),
  resistance: z.coerce.number().int().positive().optional(),
});

export async function action({ request, context }: Route.ActionArgs) {
  const user = context.get(userContext)!;
  const todayStr = todayDateString();
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "logSet") {
    const raw = Object.fromEntries(formData);
    const result = logSetSchema.safeParse(raw);
    if (!result.success) {
      return data({ error: "Invalid set" }, { status: 400 });
    }

    const plan = await getTodaysPlan(user.id, todayStr);
    const session = await getOrCreateSession(user.id, todayStr, plan);

    const existingSets = await db
      .select()
      .from(sessionSets)
      .where(
        and(
          eq(sessionSets.sessionId, session.id),
          eq(sessionSets.exerciseId, result.data.exerciseId),
        ),
      );

    await db.insert(sessionSets).values({
      sessionId: session.id,
      exerciseId: result.data.exerciseId,
      setNumber: existingSets.length + 1,
      reps: result.data.reps ?? null,
      weight: result.data.weight?.toString() ?? null,
      durationSeconds: result.data.durationMinutes
        ? Math.round(result.data.durationMinutes * 60)
        : null,
      speed: result.data.speed?.toString() ?? null,
      resistanceLevel: result.data.resistance ?? null,
    });
    return { ok: true };
  }

  if (intent === "removeSet") {
    const setId = String(formData.get("setId"));
    const set = await db.query.sessionSets.findFirst({
      where: eq(sessionSets.id, setId),
      with: { session: true },
    });
    if (set && set.session.userId === user.id) {
      await db.delete(sessionSets).where(eq(sessionSets.id, setId));
    }
    return { ok: true };
  }

  return data({ error: "Unknown action" }, { status: 400 });
}

function LogSetForm({
  exercise,
  exerciseOptions,
}: {
  exercise?: Exercise;
  exerciseOptions?: Exercise[];
}) {
  const fetcher = useFetcher();
  const [selectedId, setSelectedId] = useState(exercise?.id ?? "");
  const active =
    exercise ?? exerciseOptions?.find((e) => e.id === selectedId);

  return (
    <fetcher.Form method="post" className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="intent" value="logSet" />
      {exercise ? (
        <input type="hidden" name="exerciseId" value={exercise.id} />
      ) : (
        <div className="flex flex-col gap-2">
          <Label>Exercise</Label>
          <Select
            name="exerciseId"
            value={selectedId}
            onValueChange={setSelectedId}
          >
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Choose" />
            </SelectTrigger>
            <SelectContent>
              {exerciseOptions?.map((e) => (
                <SelectItem key={e.id} value={e.id}>
                  {e.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {active?.exerciseType === "strength" ? (
        <>
          <div className="flex flex-col gap-2">
            <Label>Reps</Label>
            <Input name="reps" type="number" min={1} className="w-20" />
          </div>
          {active.equipment !== "bodyweight" ? (
            <div className="flex flex-col gap-2">
              <Label>Weight</Label>
              <Input
                name="weight"
                type="number"
                min={0}
                step="0.5"
                className="w-24"
              />
            </div>
          ) : null}
        </>
      ) : null}

      {active?.exerciseType === "cardio" ? (
        <>
          <div className="flex flex-col gap-2">
            <Label>Duration (min)</Label>
            <Input
              name="durationMinutes"
              type="number"
              min={1}
              className="w-24"
            />
          </div>
          {active.equipment === "treadmill" ? (
            <div className="flex flex-col gap-2">
              <Label>Speed</Label>
              <Input
                name="speed"
                type="number"
                min={0}
                step="0.1"
                className="w-20"
              />
            </div>
          ) : null}
          {active.equipment === "rowing_machine" ? (
            <div className="flex flex-col gap-2">
              <Label>Resistance</Label>
              <Input
                name="resistance"
                type="number"
                min={1}
                className="w-20"
              />
            </div>
          ) : null}
        </>
      ) : null}

      <Button type="submit" disabled={!active} size="sm">
        Log set
      </Button>
    </fetcher.Form>
  );
}

function LoggedSetsList({
  sets,
}: {
  sets: Array<{
    id: string;
    reps: number | null;
    weight: string | null;
    durationSeconds: number | null;
    speed: string | null;
    resistanceLevel: number | null;
  }>;
}) {
  if (sets.length === 0) return null;
  return (
    <ul className="flex flex-col gap-1">
      {sets.map((set, index) => (
        <li
          key={set.id}
          className="text-muted-foreground flex items-center gap-2 text-sm"
        >
          <span>
            Set {index + 1}: {setSummary(set)}
          </span>
          <form method="post" className="inline">
            <input type="hidden" name="intent" value="removeSet" />
            <input type="hidden" name="setId" value={set.id} />
            <button type="submit" className="underline">
              remove
            </button>
          </form>
        </li>
      ))}
    </ul>
  );
}

export default function Today({ loaderData }: Route.ComponentProps) {
  const { plan, loggedSets, allExercises } = loaderData;

  const setsByExercise = new Map<string, typeof loggedSets>();
  for (const set of loggedSets) {
    const list = setsByExercise.get(set.exerciseId) ?? [];
    list.push(set);
    setsByExercise.set(set.exerciseId, list);
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="text-2xl font-bold">Today</h1>

      {plan.type === "rest" ? (
        <Badge variant="secondary" className="mt-4">
          Rest day
        </Badge>
      ) : null}
      {plan.type === "template" ? (
        <p className="text-muted-foreground mt-2">{plan.templateName}</p>
      ) : null}
      {plan.type === "none" ? (
        <p className="text-muted-foreground mt-2">
          No active routine. Log any exercise freely below.
        </p>
      ) : null}

      {plan.type === "template" ? (
        <div className="mt-6 flex flex-col gap-4">
          {plan.items.map((item) => (
            <Card key={item.exercise.id}>
              <CardHeader>
                <CardTitle className="text-base">
                  {item.exercise.name}
                </CardTitle>
                {targetSummary(item) ? (
                  <p className="text-muted-foreground text-sm">
                    {targetSummary(item)}
                  </p>
                ) : null}
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <LoggedSetsList
                  sets={setsByExercise.get(item.exercise.id) ?? []}
                />
                <LogSetForm exercise={item.exercise} />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : null}

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>
            {plan.type === "rest" ? "Log a workout anyway" : "Log another exercise"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <LogSetForm exerciseOptions={allExercises} />
        </CardContent>
      </Card>

      {loggedSets.length > 0 && plan.type !== "template" ? (
        <div className="mt-6 flex flex-col gap-4">
          {[...setsByExercise.entries()].map(([exerciseId, sets]) => (
            <Card key={exerciseId}>
              <CardHeader>
                <CardTitle className="text-base">
                  {sets[0].exercise.name}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <LoggedSetsList sets={sets} />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : null}
    </main>
  );
}
