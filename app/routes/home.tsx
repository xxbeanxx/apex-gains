import { CalendarCheckIcon, DumbbellIcon, LineChartIcon, RepeatIcon } from 'lucide-react';
import { redirect } from 'react-router';

import { userContext } from '~/auth/user-context';
import { Button } from '~/components/ui/button';

import type { Route } from './+types/home';

export function meta({}: Route.MetaArgs) {
  return [{ title: 'Apex Gains' }, { name: 'description', content: 'Track your workout journey.' }];
}

export async function loader({ context }: Route.LoaderArgs) {
  const user = context.get(userContext);
  if (user) {
    throw redirect('/today');
  }
  return null;
}

const FEATURES = [
  {
    icon: DumbbellIcon,
    title: 'Your equipment',
    body: 'An exercise library built around the machines you actually own, with form cues on every movement.',
  },
  {
    icon: RepeatIcon,
    title: 'Cycles, not weekdays',
    body: 'Arrange templates into a repeating cycle that counts from an anchor date, so a 5-day split never drifts.',
  },
  {
    icon: CalendarCheckIcon,
    title: 'Set-by-set logging',
    body: 'Every set is its own row, so pyramids and drop-sets record exactly the way you lifted them.',
  },
  {
    icon: LineChartIcon,
    title: 'Honest history',
    body: 'Ninety days of sessions, rest days included, with no streak guilt and no invented numbers.',
  },
];

export default function Home() {
  return (
    <main id="main" tabIndex={-1} className="mx-auto w-full max-w-(--content-max) flex-1 px-(--page-px) outline-none">
      <section className="flex flex-col items-center gap-6 py-20 text-center sm:py-28">
        <span className="animate-fade-in inline-flex items-center gap-2 rounded-full bg-brand-muted px-3 py-1 text-xs font-medium text-brand-strong ring-1 ring-brand/25">
          <span aria-hidden="true" className="size-1.5 rounded-full bg-brand-strong" />
          Personal workout tracker
        </span>

        <h1 className="animate-rise-in max-w-4xl font-heading text-display font-semibold tracking-tight text-balance">
          Every rep, <span className="text-brand-strong">accounted for</span>.
        </h1>

        <p className="animate-rise-in max-w-xl text-lg text-pretty text-muted-foreground">
          Build reusable templates, cycle them on your own schedule, and log every set as you lift it.
        </p>

        <div className="animate-rise-in flex flex-col items-center gap-3">
          <Button asChild size="lg" variant="brand">
            <a href="/auth/google">Sign in with Google</a>
          </Button>
          <p className="text-xs text-muted-foreground">Free, and yours alone. No streaks, no leaderboards.</p>
        </div>
      </section>

      <section aria-label="Features" className="stagger grid gap-4 pb-24 sm:grid-cols-2 lg:grid-cols-4">
        {FEATURES.map(({ icon: Icon, title, body }) => (
          <div
            key={title}
            className="flex flex-col gap-3 rounded-xl bg-card p-5 shadow-sm shadow-black/[0.03] ring-1 ring-foreground/10 dark:shadow-black/20"
          >
            <span
              aria-hidden="true"
              className="flex size-9 items-center justify-center rounded-lg bg-brand-muted text-brand-strong"
            >
              <Icon className="size-4.5" />
            </span>
            <h2 className="font-heading text-base font-medium">{title}</h2>
            <p className="text-sm text-pretty text-muted-foreground">{body}</p>
          </div>
        ))}
      </section>
    </main>
  );
}
