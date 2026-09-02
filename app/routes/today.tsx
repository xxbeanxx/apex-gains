import { userContext } from "~/auth/user-context";

import type { Route } from "./+types/today";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Today - Apex Gains" }];
}

export async function loader({ context }: Route.LoaderArgs) {
  const user = context.get(userContext);
  return { name: user?.name ?? null };
}

export default function Today({ loaderData }: Route.ComponentProps) {
  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="text-2xl font-bold">Welcome, {loaderData.name}</h1>
      <p className="text-muted-foreground mt-2">
        Today's workout will show up here.
      </p>
    </main>
  );
}
