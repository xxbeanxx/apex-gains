import type { Route } from "./+types/home";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Apex Gains" },
    { name: "description", content: "Track your workout journey." },
  ];
}

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="text-4xl font-bold tracking-tight">Apex Gains</h1>
      <p className="text-muted-foreground">
        Your workout journey starts here.
      </p>
    </main>
  );
}
