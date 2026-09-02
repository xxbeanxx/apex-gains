import { redirect } from "react-router";

import { userContext } from "~/auth/user-context";

import type { Route } from "./+types/home";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Apex Gains" },
    { name: "description", content: "Track your workout journey." },
  ];
}

export async function loader({ context }: Route.LoaderArgs) {
  const user = context.get(userContext);
  if (user) {
    throw redirect("/today");
  }
  return null;
}

export default function Home() {
  return (
    <main className="mx-auto flex min-h-[80vh] max-w-2xl flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="text-4xl font-bold tracking-tight">Apex Gains</h1>
      <p className="text-muted-foreground">
        Your workout journey starts here.
      </p>
      <a
        href="/auth/google"
        className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white"
      >
        Sign in with Google
      </a>
    </main>
  );
}
