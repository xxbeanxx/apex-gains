# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Apex Gains: a personal workout tracker (exercise library for a BowFlex
PR1000, rowing machine, and treadmill; reusable workout templates;
day-slot routines that cycle from an anchor date; per-set logging;
history). Auth is Google OIDC with open signup.

Stack: React Router v8 (Framework Mode), TypeScript, PostgreSQL
(hosted on Supabase), Drizzle ORM, Tailwind v4 + shadcn/ui, Podman.

## Commands

```bash
npm run dev           # dev server with HMR, http://localhost:5173
npm run build          # production build
npm run start           # serve a production build (build/server/index.js)
npm run typecheck        # react-router typegen, then tsc
npm run db:generate       # generate a Drizzle migration from app/db/schema.ts
npm run db:migrate         # apply pending migrations
npm run db:studio           # open Drizzle Studio against the local database
npm run db:seed              # seed/refresh the exercise library (idempotent)
npm run test                  # run the vitest unit test suite once
npm run test:watch             # vitest in watch mode
```

There is no lint/format tooling configured in this repo — `typecheck`
and `test` are the automated checks. Unit tests (vitest) live next to
the code they cover as `*.test.ts`; `app/test/mock.ts` exports a
`mock<T>(overrides)` helper for building partial test doubles without
`as any`/`as Type` casts scattered through test bodies. Most tests need
neither: the domain layer is pure, so its tests construct real
aggregates, and service tests wire real services to the in-memory
repository adapters rather than mocking a database.
Tests that touch `~/db/index.server` or
`app/auth/*` rely on `vitest.config.ts` seeding dummy `DATABASE_URL`/
`SESSION_SECRET`/etc. env vars — the postgres-js client and
`createCookieSessionStorage` are both lazy, so nothing dials out.
`dev` and `db:*` scripts load `.env` via `dotenv-cli`; `start` does
not (a container gets its environment from the runtime, not a bundled
`.env`).

Database: a hosted Supabase Postgres project (`DATABASE_URL` is its
Session pooler connection string — IPv4-compatible and supports
prepared statements, unlike the transaction pooler; the direct
connection is IPv6-only). `.github/workflows/build.yml` runs
`drizzle-kit migrate` against it on every push to `main` via the
`migrate-database` job (the `DATABASE_URL` repo secret), so schema
changes ship on merge. The app itself is hosted on Azure Container
Apps (`apex-gains` app in the `rg-apex-gains` resource group, Canada
Central, scale-to-zero), served at apex.atomic-nucleus.com via a
custom domain with an Azure-managed certificate (DNS zone in
`DefaultResourceGroup-CCAN`), and deployed by the same workflow's `deploy`
job, which runs after `migrate-database` and `build` and points the
Container App at the image `build` just pushed to GHCR (public, so no
registry pull credentials are needed) via `az containerapp update`,
authenticating to Azure with OIDC federated credentials (no stored
client secret). Every push to `main` is a full deploy — see README.md
"Hosting" and "Database migrations and deployment in CI" for details.
For local dev without
depending on Supabase, run local Postgres instead: `podman play kube
deploy/postgres-pod.yaml` (down with `--down`; data persists in the
`apex-gains-db-data` podman volume) and point `DATABASE_URL` at it.
Built with `containerfile` (not `Dockerfile`) — this project targets
Podman, not docker-compose. See README.md for full first-time setup
(env vars, Google OAuth client, etc).

## Architecture

**Routing.** `app/routes.ts` is the single route manifest (Framework
Mode, not file-system routing). All authenticated pages are nested
under the `routes/_protected.tsx` layout, which sets
`requireUserMiddleware` (`app/auth/require-user.server.ts`) to redirect
anonymous requests to `/auth/google`. The current user is threaded
through via React Router's context API: `app/auth/user-context.ts`
defines `userContext` — which holds the `Athlete` aggregate, not the raw
`users` row, so loaders have the athlete's unit preferences and
behaviour to hand — populated by `loadUserMiddleware` (see Auth, below)
and read in loaders/actions with `context.get(userContext)`.
Route modules import their generated types
from `./+types/<route-file-name>`.

**Layers.** Four, strictly one-directional — `app/domain/` depends on
nothing, and nothing above it may be skipped:

```
app/domain/       pure TS. No Drizzle, no react-router, no I/O, no env.
app/repositories/ ports speak aggregates; adapters do mapping only.
app/services/     application services (use cases) + read models.
app/routes/       parse form -> call service -> map result to HTTP.
```

**Domain layer.** `app/domain/` holds the rules. Aggregates (`Routine`,
`WorkoutTemplate`, `WorkoutSession`, `Exercise`, `Equipment`, `Athlete`,
`BodyWeightEntry`) own their own invariants; value objects (`DateOnly`,
`Weight`, `Speed`, `Duration`, `SetTarget`, `Ownership`) stop raw
strings and unitless numbers leaking upward. Aggregates never reach for
identity or time — both arrive as ports (`IdGenerator`, `Clock`, bundled
as `DomainDeps` in `app/services/shared/deps.server.ts`), which is what
lets every rule be tested with no database and no mocks. Two shared
pieces carry most of the weight: `shared/ordered.ts` (`OrderedChildren`)
is the single implementation of append / remove-and-close-the-gap /
swap, and `shared/forking.ts` is the shape every `editableCopyFor`
returns. Cross-aggregate rules that belong to no single root are domain
services — see `domain/routine/activation.ts`.

**Data layer.** `app/db/schema.ts` is the single Drizzle schema
(Postgres). Repositories in `app/repositories/` are ports over
*aggregates*, not rows: `load` / `save` / `delete` plus real queries,
with a Drizzle adapter and an in-memory one each, selected per process by
`*-repository.server.ts` on whether `DATABASE_URL` is set. Adapters map
snapshots to rows and hold no rules. `save` receives the whole aggregate
rather than a change list, so it reconstructs the delta with
`shared/diff-children.ts`, and writes reordered children through
`shared/write-positions.ts` — a two-pass negative-scratch write, because
Postgres checks the `(parentId, position)` unique constraint per
statement and any permutation would otherwise collide mid-update.
Transactions are ambient: `UnitOfWork.run` publishes one via
`AsyncLocalStorage` (`app/db/transaction.server.ts`) and adapters query
through `dbScope`, never `db`, so writes stay inside it.

**Services.** `app/services/*.server.ts` are the use cases routes call —
`RoutineService`, `TemplateService`, `WorkoutLogService`,
`ExerciseLibraryService`, `TrainingPlanService`, `ProgressService`,
`AthleteService`, `BodyWeightService`. They orchestrate (load → hand off
to the aggregate → save) and own no rules themselves. **They return
plain DTOs, never domain objects**: React Router serializes loader data,
so anything with methods cannot cross that boundary. Chart view types
live in `app/services/progress-view.ts` (no `.server` suffix) precisely
so client components can import them.

**Sample data and fork-on-write.** `exercises`, `templates`, and
`routines` rows with a null `userId` are seeded sample/system data
shared read-only by every account — `Ownership` in
`domain/shared/ownership.ts` is where that null is interpreted, once.
Editing a sample copies it (with its children — equipment links,
template exercises, routine slots) into a per-user row with
`forkedFromId` pointing back at the sample; the original is then
excluded from that user's view so the same logical item doesn't show
twice. The copy is `aggregate.editableCopyFor(userId, deps)`; deciding
*whether* to copy — reusing an existing fork instead of minting a second
one — needs a query, so it lives in
`app/services/shared/fork.server.ts` (`resolveEditableCopy`), which
every mutating service goes through. Because a fork's children get new
ids, an id that arrived on a form names a child of the *sample*; the
returned `translateChildId` maps it onto the copy by position. The
`sampleOrOwn*Where` query builders (in each Drizzle adapter) list own
rows plus not-yet-forked samples. So "does this row's `userId` match the
current user" isn't quite the whole authorization story — scoped loaders
must also decide whether to include the null-`userId` sample rows.

**Domain model shape**, roughly nested:
`templates` (a named list of exercises with target sets/reps/weight or
duration/speed/resistance, owned by a user) → `routines` (a named,
ordered cycle of `routineSlots`, each slot either referencing a
template or standing for a rest day) → `workoutSessions` (one row per
user per calendar date, snapshotting which routine/template applied
that day) → `sessionSets` (individual logged sets, one row per set —
not per exercise — so pyramids/drop-sets are representable; template
"targets" just pre-fill the logging form, every field stays editable
per set). `exercises` carry an `exerciseType` (`strength` | `cardio`)
and link to `equipment` via `exerciseEquipment`; cardio fields differ
by equipment (treadmill: duration + speed; rowing: duration +
resistance — no distance/pace, since neither is reliably derivable
from what's tracked).

**Routines are day-count cycles, not weekdays.** A routine's "today"
slot is `(days since anchorDate) mod (slot count)` — `Routine.slotOn`
in `app/domain/routine/routine.ts`. This is strict calendar-day math
done in UTC on `YYYY-MM-DD` strings (`DateOnly`): it does not pause for
missed days, and a routine's `anchorDate` can be set independently of
when it was activated or of what weekday it falls on. Only one routine
per user may have `isActive = true`; that is a rule about a *set* of
routines, so it lives in `domain/routine/activation.ts`
(`activateRoutine`) rather than on the aggregate, with the schema's
partial unique index as the backstop — the two routines it changes must
be saved in one transaction. `TrainingPlanService.planFor` is the
canonical read path from "active routine" to "today's exercises."

**Route module action pattern.** Routes with multiple mutations use a
single `action` with an `intent` hidden field dispatched via
if/else-if (see `app/routes/routines.$routineId.tsx` for the fullest
example: rename, reanchor, activate/deactivate, addSlot, removeSlot,
move, delete). Each branch validates its own `formData` with a local
Zod schema. Both detail routes share a `settle` helper that maps a
service result onto HTTP: not-found becomes a 404, and a non-null
`forkedId` becomes a redirect to the fork's own URL, since the edit
would be invisible at the sample's. Every mutating form is a
plain `<form method="post">` (no client-side fetchers for these), and
`~/components/ui/submit-button.tsx` (`SubmitButton`) infers its own
pending state from `useNavigation()` matched against a `match={{
intent: "..." }}` prop — pass `match` whenever a page has more than
one form, or every submit button on the page will spin together.

**Auth.** Google OIDC via `openid-client` (`app/auth/oidc.server.ts`,
`oidc-state.server.ts`), session stored as a signed httpOnly cookie
(`app/auth/session.server.ts`). `loadUserMiddleware`
(`app/auth/current-user.server.ts`) reads the session and populates
`userContext` on every request (registered in `root.tsx`'s
`middleware` export, ahead of `requireUserMiddleware` which only the
`_protected` layout adds). Any Google account can sign in (open
signup) — a `users` row is created on first login. There is no
role/permission system; all authorization is "does this row's
`userId` match the current user" (see `loadOwnedRoutine`-style loaders
that scope every query by `userId` before returning 404) plus the
sample-data fork rule above. Azure Container Apps terminates TLS at
its ingress and forwards plain HTTP with `X-Forwarded-*` headers, so
the app is served by a custom `server.ts` (an Express server built on
`@react-router/express`, replacing `react-router-serve`, which offers
no way to configure this) that enables Express's "trust proxy" — and
also copies `X-Forwarded-Host` onto the `Host` header before React
Router sees the request, working around a bug in
`@react-router/express`'s request-building where it falls back to the
raw (proxy-internal) `Host` header's port whenever `X-Forwarded-Host`
lacks one. Without both pieces, `request.url`'s origin wouldn't match
the browser's `Origin` header on POSTs, which React Router's built-in
CSRF check rejects with a 400, and `app/routes/auth.google.callback.tsx`
rebuilds the URL passed to `authorizationCodeGrant` from the `ORIGIN`
env var instead of trusting `request.url` so the token exchange's
`redirect_uri` matches what's registered with Google.

**Units.** Measurements are stored canonically — pounds for weight,
km/h for speed, seconds for duration — and converted at the edges:
`Weight.in(unit, n)` on the way in, `AthletePreferences.formatWeight` on
the way out. The `numeric` columns carry no unit and postgres-js returns
them as strings, so nothing above the domain should ever see a bare
weight string or append a unit by hand. An athlete's `weightUnit` /
`distanceUnit` from /settings is the only thing that decides how a
number is rendered.

**UI.** shadcn/ui primitives (Radix + `class-variance-authority`) live
in `app/components/ui/`; layout chrome (`Page`, `PageHeader`,
`Section`) is in `app/components/layout/page.tsx`. Design tokens
("Volt on Graphite" theme: warm-neutral graphite base, one rationed
volt accent for active states/focus rings/progress, dark mode via
`.dark` class) are defined once in `app/app.css` — extend the token
set there rather than hardcoding colors in components. Path alias `~/`
maps to `app/` (see `tsconfig.json` and `components.json`).
`app/components/nav-progress.tsx` drives an NProgress bar off
`useNavigation()` so client-side transitions get a loading indicator.

**Logging.** `app/lib/logger.server.ts` exports a base `pino` logger
(JSON on stdout/stderr everywhere except `development`, where it pipes
through `pino-pretty`; Azure Container Apps ships stdout JSON straight
into Log Analytics) and `requestLoggingMiddleware`, registered first
in `root.tsx`'s `middleware` export, which binds a per-request child
logger (with a `requestId`) into `loggerContext` and logs one
`"request completed"`/`"request failed"` line per request with
method/path/status/duration/userId. Route code that wants request-
scoped logging reads it via `context.get(loggerContext)` rather than
importing the base `logger` directly.

**Build info.** `app/lib/build-info.server.ts`'s `getBuildInfo()`
returns the `VERSION_TAG` env var (baked into the image as
`date-sha-buildnum` by `containerfile`/`build.yml`) or, outside a
container, the working tree's short git SHA. It's shown in the app
footer (`root.tsx`) and included in every log line's `build` field.
