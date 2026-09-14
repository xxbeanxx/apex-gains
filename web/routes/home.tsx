import { CalendarCheckIcon, CalendarPlusIcon, DumbbellIcon, LineChartIcon, MoonIcon, RepeatIcon } from 'lucide-react';
import { Link } from 'react-router';
import { userContext } from '~web/auth/user-context';
import { SessionRow } from '~web/components/history/session-row';
import { Page, PageHeader, Section } from '~web/components/layout/page';
import { Button } from '~web/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '~web/components/ui/card';
import { EmptyState } from '~web/components/ui/empty-state';
import { Stat } from '~web/components/ui/stat';
import { athleteCalendarContext, progressServiceContext, trainingPlanServiceContext } from '~web/router/load-context';

import type { Route } from './+types/home';

export function meta() {
  return [{ title: 'Apex Gains' }, { name: 'description', content: 'Track your workout journey.' }];
}

export async function loader({ context }: Route.LoaderArgs) {
  const athlete = context.get(userContext);

  if (!athlete) {
    return null;
  }

  const today = context.get(athleteCalendarContext).today(athlete);
  const [dashboard, plan] = await Promise.all([
    context.get(progressServiceContext).dashboard(athlete),
    context.get(trainingPlanServiceContext).planFor(athlete, today),
  ]);

  return { name: athlete.name, dashboard: dashboard, plan: plan };
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
    body: 'Arrange workouts into a repeating cycle that counts from an anchor date, so a 5-day split never drifts.',
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

function MarketingHome() {
  return (
    <main id="main" tabIndex={-1} className="mx-auto w-full max-w-(--content-max) flex-1 px-(--page-px) outline-none">
      <section className="flex flex-col items-center gap-6 py-20 text-center sm:py-28">
        <span className="animate-fade-in bg-brand-muted text-brand-strong ring-brand/25 inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium ring-1">
          <span aria-hidden="true" className="bg-brand-strong size-1.5 rounded-full" />
          Personal workout tracker
        </span>

        <h1 className="animate-rise-in font-heading text-display max-w-4xl font-semibold tracking-tight text-balance">
          Every rep, <span className="text-brand-strong">accounted for</span>.
        </h1>

        <p className="animate-rise-in text-muted-foreground max-w-xl text-lg text-pretty">
          Build reusable workouts, cycle them on your own schedule, and log every set as you lift it.
        </p>

        <div className="animate-rise-in flex flex-col items-center gap-3">
          <Button asChild size="lg" variant="brand">
            <a href="/auth/google">Sign in with Google</a>
          </Button>
          <p className="text-muted-foreground text-xs">Free, and yours alone. No streaks, no leaderboards.</p>
        </div>
      </section>

      <section aria-label="Features" className="stagger grid gap-4 pb-24 sm:grid-cols-2 lg:grid-cols-4">
        {FEATURES.map(({ icon: Icon, title, body }) => (
          <div
            key={title}
            className="bg-card ring-foreground/10 flex flex-col gap-3 rounded-xl p-5 shadow-sm ring-1 shadow-black/[0.03] dark:shadow-black/20"
          >
            <span
              aria-hidden="true"
              className="bg-brand-muted text-brand-strong flex size-9 items-center justify-center rounded-lg"
            >
              <Icon className="size-4.5" />
            </span>
            <h2 className="font-heading text-base font-medium">{title}</h2>
            <p className="text-muted-foreground text-sm text-pretty">{body}</p>
          </div>
        ))}
      </section>
    </main>
  );
}

export default function Home({ loaderData }: Route.ComponentProps) {
  if (!loaderData) {
    return <MarketingHome />;
  }

  const { name, dashboard, plan } = loaderData;
  const planLabel = plan.type === 'workout' ? plan.workoutName : plan.type === 'rest' ? 'Rest day' : 'No active plan';

  return (
    <Page>
      <PageHeader title={`Welcome back, ${name}`} description="Here's where things stand." />

      <div className="mt-(--section-gap) grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Sessions this week" value={dashboard.sessionsThisWeek} />
        <Stat label="Sets this week" value={dashboard.setsThisWeek} />
        <Stat label="Workouts logged" value={dashboard.workoutsLogged} />
        <Stat label="Active plan" value={dashboard.activePlanName ?? 'None'} />
      </div>

      <Card interactive className="relative mt-(--section-gap)">
        <CardHeader>
          <CardTitle className="text-muted-foreground text-sm font-medium">Today</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-between gap-3">
          <span className="font-heading flex items-center gap-2 text-lg font-semibold">
            {plan.type === 'rest' ? <MoonIcon className="text-muted-foreground size-4" aria-hidden="true" /> : null}
            {planLabel}
          </span>
          <Link to="/today" className="text-brand-strong text-sm font-medium after:absolute after:inset-0 after:content-['']">
            Log it →
          </Link>
        </CardContent>
      </Card>

      <Section title="Recent sessions">
        {dashboard.recentSessions.length === 0 ? (
          <EmptyState
            icon={CalendarPlusIcon}
            title="Nothing logged yet"
            description="Log your first set on the Today page and it will appear here."
            compact
          />
        ) : (
          <ul className="flex flex-col gap-1.5">
            {dashboard.recentSessions.map((session) => (
              <SessionRow key={session.id} session={session} />
            ))}
          </ul>
        )}
      </Section>
    </Page>
  );
}
